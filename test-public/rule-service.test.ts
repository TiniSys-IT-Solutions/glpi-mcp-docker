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
