import assert from 'node:assert/strict';
import test from 'node:test';
import { LegacyImportEntityRuleService } from '../src/api/legacy/rules.js';
import { HighLevelImportEntityRuleService } from '../src/api/highlevel/rules.js';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { HighLevelClient } from '../src/api/highlevel/client.js';

test('Legacy rule detail combines RuleImportEntity with criteria and actions', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const requestedPaths: string[] = [];

  (client as any).getItem = async (itemtype: string, id: number) => {
    assert.equal(itemtype, 'RuleImportEntity');
    assert.equal(id, 95);
    return { id, name: 'GENBIO – AMBERT – Subnet' };
  };
  (client.http as any).request = async (path: string) => {
    requestedPaths.push(path);
    return { data: path.endsWith('RuleCriteria')
      ? [{ id: 10, rules_id: 95, criteria: 'subnet' }]
      : [{ id: 11, rules_id: 95, field: 'entities_id' }] };
  };

  const service = new LegacyImportEntityRuleService(client);
  assert.deepEqual(await service.get(95), {
    id: 95,
    name: 'GENBIO – AMBERT – Subnet',
    criteria: [{ id: 10, rules_id: 95, criteria: 'subnet' }],
    actions: [{ id: 11, rules_id: 95, field: 'entities_id' }],
  });
  assert.deepEqual(requestedPaths, [
    'RuleImportEntity/95/RuleCriteria',
    'RuleImportEntity/95/RuleAction',
  ]);
});

test('Legacy rule child reads reject criteria attached to a different rule', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  (client as any).getItem = async () => ({ id: 10, rules_id: 94 });

  const service = new LegacyImportEntityRuleService(client);
  await assert.rejects(
    () => service.getCriterion(95, 10),
    /RuleImportEntity 95 does not contain criterion 10/
  );
});

test('High-Level rules use the official versioned ImportEntity routes', async () => {
  const requestedUrls: string[] = [];
  const client = new HighLevelClient({
    url: 'https://glpi.test',
    apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const service = new HighLevelImportEntityRuleService(client);

  await service.list({ start: 5, limit: 10, order: 'ASC' });
  await service.get(95);
  await service.listCriteria(95, {});
  await service.getCriterion(95, 10);
  await service.listActions(95, {});
  await service.getAction(95, 11);

  assert.deepEqual(requestedUrls, [
    'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule?start=5&limit=10&order=ASC',
    'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/95',
    'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/95/Criteria?start=0&limit=50',
    'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/95/Criteria/10',
    'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/95/Action?start=0&limit=50',
    'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/95/Action/11',
  ]);
});

test('Legacy subnet rule creation writes a disabled rule, CIDR criterion and two actions', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const creates: Array<{ itemtype: string; payload: Record<string, unknown> }> = [];
  (client as any).createItem = async (itemtype: string, payload: Record<string, unknown>) => {
    creates.push({ itemtype, payload });
    return { id: itemtype === 'RuleImportEntity' ? 101 : 200 + creates.length };
  };
  (client as any).getItem = async () => ({ id: 101, name: 'GENBIO – TEST – Subnet', is_active: 0 });
  (client.http as any).request = async (path: string) => ({
    data: path.endsWith('RuleCriteria')
      ? [{ rules_id: 101, criteria: 'subnet', condition: 333, pattern: '192.0.2.0/24' }]
      : [{ rules_id: 101, action_type: 'assign' }],
  });

  const service = new LegacyImportEntityRuleService(client);
  const result = await service.createSubnetRule({
    name: 'GENBIO – TEST – Subnet',
    cidr: '192.0.2.0/24',
    targetEntityId: 11,
    targetLocationId: 12,
    ranking: 2,
  }) as any;

  assert.equal(result.enabled, false);
  assert.equal(result.verification_required, true);
  assert.deepEqual(creates, [
    {
      itemtype: 'RuleImportEntity',
      payload: {
        name: 'GENBIO – TEST – Subnet', sub_type: 'RuleImportEntity', entities_id: 0,
        match: 'AND', is_active: 0, is_recursive: 0, ranking: 2,
      },
    },
    {
      itemtype: 'RuleCriteria',
      payload: { rules_id: 101, criteria: 'subnet', condition: 333, pattern: '192.0.2.0/24' },
    },
    {
      itemtype: 'RuleAction',
      payload: { rules_id: 101, action_type: 'assign', field: 'entities_id', value: '11' },
    },
    {
      itemtype: 'RuleAction',
      payload: { rules_id: 101, action_type: 'assign', field: 'locations_id', value: '12' },
    },
  ]);
});

test('Legacy subnet rule creation rolls back the new rule when a child write fails', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let createCount = 0;
  let deleted: unknown;
  (client as any).createItem = async () => {
    createCount += 1;
    if (createCount === 3) throw new Error('action failed');
    return { id: createCount === 1 ? 101 : 201 };
  };
  (client as any).deleteItem = async (...args: unknown[]) => { deleted = args; return true; };

  const service = new LegacyImportEntityRuleService(client);
  await assert.rejects(
    () => service.createSubnetRule({
      name: 'GENBIO – TEST – Subnet', cidr: '192.0.2.0/24',
      targetEntityId: 11, targetLocationId: 12,
    }),
    /action failed/
  );
  assert.deepEqual(deleted, ['RuleImportEntity', 101, true, false]);
});

test('Legacy subnet rule creation rejects a CIDR containing host bits', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const service = new LegacyImportEntityRuleService(client);
  await assert.rejects(
    () => service.createSubnetRule({
      name: 'Invalid', cidr: '192.0.2.15/24', targetEntityId: 11, targetLocationId: 12,
    }),
    /canonical network address/
  );
});

test('Legacy rule activation updates only is_active and returns the verified rule', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let update: unknown;
  (client as any).updateItem = async (...args: unknown[]) => { update = args; return true; };
  (client as any).getItem = async () => ({ id: 101, is_active: 1 });
  (client.http as any).request = async () => ({ data: [] });

  const service = new LegacyImportEntityRuleService(client);
  const result = await service.setEnabled(101, true) as any;
  assert.deepEqual(update, ['RuleImportEntity', 101, { is_active: 1 }]);
  assert.equal(result.enabled, true);
  assert.equal(result.rule.id, 101);
});

test('High-Level subnet rule creation follows the official RuleController write schemas', async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const client = new HighLevelClient({
    url: 'https://glpi.test',
    apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        method: init?.method ?? 'GET',
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      const response = init?.method === 'POST' && url.endsWith('/Rule')
        ? { id: 101, name: 'GENBIO – TEST – Subnet' }
        : url.endsWith('/Rule/101') && !init?.method
          ? { id: 101, name: 'GENBIO – TEST – Subnet', is_active: false }
          : { id: 201 };
      return new Response(JSON.stringify(response), { status: 200 });
    },
  });
  const service = new HighLevelImportEntityRuleService(client);
  const result = await service.createSubnetRule({
    name: 'GENBIO – TEST – Subnet', cidr: '192.0.2.0/24',
    targetEntityId: 11, targetLocationId: 12, ranking: 2,
  }) as any;

  assert.equal(result.enabled, false);
  assert.equal(result.verification_required, true);
  assert.deepEqual(requests, [
    {
      url: 'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule',
      method: 'POST',
      body: {
        name: 'GENBIO – TEST – Subnet', entity: { id: 0 }, is_recursive: false,
        description: '', comment: '', is_active: false, match: 'AND', condition: 0, ranking: 2,
      },
    },
    {
      url: 'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/101/Criteria',
      method: 'POST',
      body: { criteria: 'subnet', condition: 333, pattern: '192.0.2.0/24' },
    },
    {
      url: 'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/101/Action',
      method: 'POST',
      body: { action_type: 'assign', field: 'entities_id', value: '11' },
    },
    {
      url: 'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/101/Action',
      method: 'POST',
      body: { action_type: 'assign', field: 'locations_id', value: '12' },
    },
    {
      url: 'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/101',
      method: 'GET',
    },
  ]);
});

test('High-Level activation uses PATCH with a native boolean', async () => {
  const requests: Array<{ method: string; body?: unknown }> = [];
  const client = new HighLevelClient({
    url: 'https://glpi.test', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (_input, init) => {
      requests.push({
        method: init?.method ?? 'GET',
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return new Response(JSON.stringify({ id: 101, is_active: true }), { status: 200 });
    },
  });
  const service = new HighLevelImportEntityRuleService(client);
  const result = await service.setEnabled(101, true) as any;
  assert.equal(result.enabled, true);
  assert.deepEqual(requests, [
    { method: 'PATCH', body: { is_active: true } },
    { method: 'GET' },
  ]);
});

test('High-Level subnet rule creation deletes the partial rule when a child write fails', async () => {
  const methods: string[] = [];
  let posts = 0;
  const client = new HighLevelClient({
    url: 'https://glpi.test', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (_input, init) => {
      const method = init?.method ?? 'GET';
      methods.push(method);
      if (method === 'POST') {
        posts += 1;
        if (posts === 3) return new Response(JSON.stringify({ detail: 'action failed' }), { status: 400 });
        return new Response(JSON.stringify({ id: posts === 1 ? 101 : 201 }), { status: 200 });
      }
      return new Response('', { status: 204 });
    },
  });
  const service = new HighLevelImportEntityRuleService(client);
  await assert.rejects(
    () => service.createSubnetRule({
      name: 'GENBIO – TEST – Subnet', cidr: '192.0.2.0/24',
      targetEntityId: 11, targetLocationId: 12,
    }),
    /action failed/
  );
  assert.deepEqual(methods, ['POST', 'POST', 'POST', 'DELETE']);
});
