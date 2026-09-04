import assert from 'node:assert/strict';
import test from 'node:test';
import { LegacyImportEntityRuleService } from '../src/api/legacy/rules.js';
import { HighLevelImportEntityRuleService } from '../src/api/highlevel/rules.js';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { HighLevelClient } from '../src/api/highlevel/client.js';
import { IMPORT_ENTITY_RULE_CRITERIA, allowedImportEntityRuleConditions } from '../src/core/rules/types.js';
import { importEntityRuleCriterionCreateSchema } from '../src/core/rules/schemas.js';

test('criterion schema accepts exactly the nine native RuleImportEntity criteria', () => {
  for (const criterion of IMPORT_ENTITY_RULE_CRITERIA) {
    assert.equal(importEntityRuleCriterionCreateSchema.parse({
      rule_id: 95, criterion, condition: 0, pattern: 'value',
    }).criterion, criterion);
  }
  assert.throws(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion: 'unknown', condition: 333, pattern: 'x' }));
  assert.throws(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 0, criterion: 'ip', condition: 333, pattern: 'x' }));
  assert.throws(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion: 'ip', condition: -1, pattern: 'x' }));
  assert.throws(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion: 'ip', condition: 333 }));
  assert.equal(importEntityRuleCriterionCreateSchema.parse({
    rule_id: 95, criterion: 'ip', condition: 333, pattern: '10.63.170.0/24',
  }).pattern, '10.63.170.0/24');
});

test('criterion schema covers the complete GLPI 11 RuleImportEntity condition matrix', () => {
  const common = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const criterion of ['tag', 'domain', 'name', 'serial', 'itemtype', 'oscomment'] as const) {
    assert.deepEqual(allowedImportEntityRuleConditions(criterion), common);
    for (const condition of common) {
      assert.doesNotThrow(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion, condition, pattern: 'value' }));
    }
  }
  for (const criterion of ['ip', 'subnet'] as const) {
    assert.deepEqual(allowedImportEntityRuleConditions(criterion), [...common, 333, 334]);
    for (const condition of [...common, 333, 334]) {
      assert.doesNotThrow(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion, condition, pattern: '10.63.170.0/24' }));
    }
  }
  assert.deepEqual(allowedImportEntityRuleConditions('_source'), [0, 1]);
  for (const condition of [0, 1]) {
    assert.doesNotThrow(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion: '_source', condition, pattern: 'NATIVE_INVENTORY' }));
  }
  for (const condition of [10, 11, 12, 30, 31, 32, 33, 34]) {
    assert.throws(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion: 'ip', condition, pattern: 'value' }));
  }
  assert.throws(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion: 'tag', condition: 333, pattern: 'value' }));
  assert.throws(() => importEntityRuleCriterionCreateSchema.parse({ rule_id: 95, criterion: '_source', condition: 8, pattern: 'value' }));
});

test('Legacy criterion addition validates, writes native fields and verifies the child', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const creates: unknown[] = [];
  (client as any).getItem = async (itemtype: string, id: number) => itemtype === 'RuleImportEntity'
    ? { id, sub_type: 'RuleImportEntity', match: 'OR' }
    : { id, rules_id: 95, criteria: 'ip', condition: 333, pattern: '10.63.170.0/24' };
  (client.http as any).request = async (path: string) => ({
    data: path.endsWith('RuleCriteria')
      ? [{ id: 1, rules_id: 95, criteria: 'subnet', condition: 333, pattern: '10.63.170.0/24' }]
      : [],
  });
  (client as any).createItem = async (itemtype: string, payload: unknown) => {
    creates.push({ itemtype, payload });
    return { id: 2 };
  };
  const result = await new LegacyImportEntityRuleService(client).addCriterion(95, {
    criterion: 'ip', condition: 333, pattern: '10.63.170.0/24',
  }) as any;

  assert.equal(result.created, true);
  assert.equal(result.already_exists, false);
  assert.equal(result.criterion.rules_id, 95);
  assert.deepEqual(creates, [{
    itemtype: 'RuleCriteria',
    payload: { rules_id: 95, criteria: 'ip', condition: 333, pattern: '10.63.170.0/24' },
  }]);
});

test('Legacy criterion addition is idempotent only for an exact triple', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let creates = 0;
  let verifiedCondition = 333;
  let verifiedPattern = '10.63.170.0/24';
  (client as any).getItem = async (itemtype: string, id: number) => itemtype === 'RuleImportEntity'
    ? { id, sub_type: 'RuleImportEntity' }
    : { id, rules_id: 95, criteria: 'ip', condition: verifiedCondition, pattern: verifiedPattern };
  (client.http as any).request = async () => ({ data: [
    { id: 7, rules_id: 95, criteria: 'ip', condition: '333', pattern: '10.63.170.0/24' },
  ] });
  (client as any).createItem = async () => { creates++; return { id: 8 }; };
  const service = new LegacyImportEntityRuleService(client);

  const duplicate = await service.addCriterion(95, { criterion: 'ip', condition: 333, pattern: '10.63.170.0/24' }) as any;
  assert.equal(duplicate.already_exists, true);
  assert.equal(creates, 0);

  verifiedPattern = '10.63.171.0/24';
  await service.addCriterion(95, { criterion: 'ip', condition: 333, pattern: verifiedPattern });
  assert.equal(creates, 1, 'a different pattern must not be treated as a duplicate');
  verifiedCondition = 334;
  verifiedPattern = '10.63.170.0/24';
  await service.addCriterion(95, { criterion: 'ip', condition: verifiedCondition, pattern: '10.63.170.0/24' });
  assert.equal(creates, 2, 'a different condition must not be treated as a duplicate');
});

test('Legacy criterion addition rejects missing and wrong-subtype rules and propagates GLPI errors', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const service = new LegacyImportEntityRuleService(client);
  (client as any).getItem = async () => { throw new Error('GLPI rule not found'); };
  await assert.rejects(() => service.addCriterion(404, { criterion: 'ip', condition: 333, pattern: 'x' }), /not found/);
  (client as any).getItem = async () => ({ id: 95, sub_type: 'RuleTicket' });
  await assert.rejects(() => service.addCriterion(95, { criterion: 'ip', condition: 333, pattern: 'x' }), /not a RuleImportEntity/);
});

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

test('Legacy rule update is partial, clears text explicitly and preserves children', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const writes: unknown[] = [];
  let reads = 0;
  (client as any).getItem = async () => ({ id: 101, name: 'Old', sub_type: 'RuleImportEntity' });
  (client.http as any).request = async () => ({ data: [] });
  (client as any).updateItem = async (...args: unknown[]) => { writes.push(args); return true; };
  const service = new LegacyImportEntityRuleService(client);

  const result = await service.update(101, {
    description: 'importe regle affectation par cidr — 02/09/2026',
    comment: null,
    ranking: 1,
    recursive: false,
    match: 'AND',
  }) as any;

  assert.deepEqual(writes, [[
    'RuleImportEntity', 101, {
      description: 'importe regle affectation par cidr — 02/09/2026',
      comment: '', ranking: 1, is_recursive: 0, match: 'AND',
    },
  ]]);
  assert.equal(result.success, true);
  assert.equal(result.verification_status, 'succeeded');
  assert.equal('sub_type' in (writes[0] as any[])[2], false);
  assert.equal(reads, 0);
});

test('complete mocked scenario changes AND to OR and adds matching subnet/IP criteria', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let match = 'AND';
  const criteria: Array<Record<string, unknown>> = [
    { id: 1, rules_id: 95, criteria: 'subnet', condition: 333, pattern: '10.63.170.0/24' },
  ];
  (client as any).getItem = async (itemtype: string, id: number) => itemtype === 'RuleCriteria'
    ? criteria.find((item) => item.id === id)
    : { id, sub_type: 'RuleImportEntity', match };
  (client.http as any).request = async (path: string) => ({ data: path.endsWith('RuleCriteria') ? [...criteria] : [] });
  (client as any).updateItem = async (_type: string, _id: number, payload: any) => { match = payload.match; };
  (client as any).createItem = async (_type: string, payload: Record<string, unknown>) => {
    const created = { id: 2, ...payload };
    criteria.push(created);
    return { id: 2 };
  };
  const service = new LegacyImportEntityRuleService(client);

  await service.update(95, { match: 'OR' });
  await service.addCriterion(95, { criterion: 'ip', condition: 333, pattern: '10.63.170.0/24' });
  const rule = await service.get(95) as any;
  assert.equal(rule.match, 'OR');
  assert.deepEqual(rule.criteria.map(({ criteria: key, condition, pattern }: any) => ({ key, condition, pattern })), [
    { key: 'subnet', condition: 333, pattern: '10.63.170.0/24' },
    { key: 'ip', condition: 333, pattern: '10.63.170.0/24' },
  ]);
});

test('Legacy rule update reports a successful write separately from failed verification', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let itemReads = 0;
  (client as any).getItem = async () => {
    itemReads++;
    if (itemReads > 1) throw new Error('verification forbidden');
    return { id: 101 };
  };
  (client.http as any).request = async () => ({ data: [] });
  (client as any).updateItem = async () => true;

  const result = await new LegacyImportEntityRuleService(client).update(101, { description: 'new' }) as any;
  assert.equal(result.success, true);
  assert.equal(result.update_status, 'succeeded');
  assert.equal(result.verification_status, 'failed');
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

test('High-Level criterion addition reuses the confirmed Criteria route and verifies the result', async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const client = new HighLevelClient({
    url: 'https://glpi.test', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (method === 'POST') return new Response(JSON.stringify({ id: 2 }), { status: 200 });
      if (url.endsWith('/Criteria?start=0&limit=50')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.endsWith('/Criteria/2')) return new Response(JSON.stringify({
        id: 2, rules_id: 95, criteria: 'ip', condition: 333, pattern: '10.63.170.0/24',
      }), { status: 200 });
      return new Response(JSON.stringify({ id: 95, sub_type: 'RuleImportEntity', match: 'OR' }), { status: 200 });
    },
  });
  const result = await new HighLevelImportEntityRuleService(client).addCriterion(95, {
    criterion: 'ip', condition: 333, pattern: '10.63.170.0/24',
  }) as any;
  assert.equal(result.created, true);
  assert.deepEqual(requests[2], {
    url: 'https://glpi.test/api.php/v2.3/Rule/Collection/ImportEntity/Rule/95/Criteria',
    method: 'POST', body: { criteria: 'ip', condition: 333, pattern: '10.63.170.0/24' },
  });
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
    { method: 'GET' },
    { method: 'PATCH', body: { is_active: true } },
    { method: 'GET' },
  ]);
});

test('High-Level rule update reads before PATCH and sends only explicit fields', async () => {
  const requests: Array<{ method: string; body?: unknown }> = [];
  const client = new HighLevelClient({
    url: 'https://glpi.test', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (_input, init) => {
      requests.push({ method: init?.method ?? 'GET', ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      return new Response(JSON.stringify({ id: 101, criteria: [{ id: 1 }], actions: [{ id: 2 }] }), { status: 200 });
    },
  });

  const result = await new HighLevelImportEntityRuleService(client).update(101, {
    description: 'importe regle affectation par cidr — 02/09/2026',
    comment: null,
  }) as any;
  assert.equal(result.verification_status, 'succeeded');
  assert.deepEqual(requests, [
    { method: 'GET' },
    { method: 'PATCH', body: { description: 'importe regle affectation par cidr — 02/09/2026', comment: '' } },
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
