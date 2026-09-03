import assert from 'node:assert/strict';
import test from 'node:test';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { cidrToIPRange, LegacyInventoryPluginService } from '../src/api/legacy/inventory-plugin.js';

test('cidrToIPRange excludes IPv4 network and broadcast addresses by default', () => {
  assert.deepEqual(cidrToIPRange('198.51.100.0/24'), {
    ip_start: '198.51.100.1',
    ip_end: '198.51.100.254',
  });
  assert.deepEqual(cidrToIPRange('192.0.2.10/31'), {
    ip_start: '192.0.2.10',
    ip_end: '192.0.2.11',
  });
});

test('createIPRangeFromCIDR maps friendly entity and calculated bounds', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let captured: unknown;
  (client as any).createItem = async (itemtype: string, payload: unknown) => {
    captured = { itemtype, payload };
    return { id: 41 };
  };
  const service = new LegacyInventoryPluginService(client);
  assert.deepEqual(await service.createIPRangeFromCIDR({
    name: 'Example site discovery', cidr: '198.51.100.0/24', entity_id: 10,
  }), { id: 41 });
  assert.deepEqual(captured, {
    itemtype: 'PluginGlpiinventoryIPRange',
    payload: { name: 'Example site discovery', entities_id: 10, ip_start: '198.51.100.1', ip_end: '198.51.100.254' },
  });
});

test('listIPRangeSNMPCredentials filters the documented relation search fields', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let captured: unknown;
  (client.search as any).search = async (itemtype: string, options: unknown) => {
    captured = { itemtype, options };
    return { data: [{ 2: 4, 3: 1, 4: 2 }], totalcount: 1, count: 1, start: 0 };
  };
  const service = new LegacyInventoryPluginService(client);

  assert.deepEqual(await service.listIPRangeSNMPCredentials({
    ip_range_id: 1, snmp_credential_id: 2, start: 0, limit: 10,
  }), [{ 2: 4, 3: 1, 4: 2 }]);
  assert.deepEqual(captured, {
    itemtype: 'PluginGlpiinventoryIPRange_SNMPCredential',
    options: {
      criteria: [
        { field: 3, searchtype: 'equals', value: 1 },
        { field: 4, searchtype: 'equals', value: 2, link: 'AND' },
      ],
      forcedisplay: [2, 3, 4], start: 0, limit: 10,
      sort: undefined, order: 'ASC', giveItems: true,
    },
  });
});

test('attachSNMPCredentialToIPRange validates both objects, rejects duplicates and verifies creation', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const reads: unknown[] = [];
  let created: unknown;
  (client as any).getItem = async (itemtype: string, id: number) => {
    reads.push({ itemtype, id });
    return { id, itemtype, rank: 2 };
  };
  (client.search as any).search = async () => ({ data: [], totalcount: 0, count: 0, start: 0 });
  (client as any).createItem = async (itemtype: string, payload: unknown) => {
    created = { itemtype, payload };
    return { id: 17 };
  };
  const service = new LegacyInventoryPluginService(client);

  const result = await service.attachSNMPCredentialToIPRange({ ip_range_id: 3, snmp_credential_id: 8, rank: 2 });
  assert.deepEqual(created, {
    itemtype: 'PluginGlpiinventoryIPRange_SNMPCredential',
    payload: { plugin_glpiinventory_ipranges_id: 3, snmpcredentials_id: 8, rank: 2 },
  });
  assert.deepEqual(reads.map((entry: any) => entry.itemtype), [
    'PluginGlpiinventoryIPRange', 'SNMPCredential', 'PluginGlpiinventoryIPRange_SNMPCredential',
  ]);
  assert.deepEqual(result, { success: true, id: 17, itemtype: 'PluginGlpiinventoryIPRange_SNMPCredential', rank: 2 });

  (client.search as any).search = async () => ({ data: [{ 2: 17 }], totalcount: 1, count: 1, start: 0 });
  await assert.rejects(
    service.attachSNMPCredentialToIPRange({ ip_range_id: 3, snmp_credential_id: 8 }),
    /already associated/,
  );
});

test('association create preserves POST success when its verification GET fails', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let createdCount = 0;
  (client as any).getItem = async (itemtype: string) => {
    if (itemtype === 'PluginGlpiinventoryIPRange_SNMPCredential') throw new Error('ERROR_RIGHT_MISSING');
    return { id: 1 };
  };
  (client.search as any).search = async () => ({ data: [], totalcount: 0, count: 0, start: 0 });
  (client as any).createItem = async () => { createdCount += 1; return { id: 18 }; };
  const service = new LegacyInventoryPluginService(client);

  assert.deepEqual(await service.attachSNMPCredentialToIPRange({ ip_range_id: 3, snmp_credential_id: 8 }), {
    success: true, id: 18, creation_status: 'succeeded', verification_status: 'failed',
    verification_error: 'Error', verification_message: 'ERROR_RIGHT_MISSING',
  });
  assert.equal(createdCount, 1);
});

test('association rank update is partial and detach deletes only the relation', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const writes: unknown[] = [];
  let readCount = 0;
  (client as any).getItem = async () => ({ id: 21, rank: readCount++ === 0 ? 1 : 4 });
  (client as any).updateItem = async (itemtype: string, id: number, payload: unknown) => writes.push({ itemtype, id, payload });
  (client as any).deleteItem = async (itemtype: string, id: number, force: boolean) => writes.push({ itemtype, id, force });
  const service = new LegacyInventoryPluginService(client);

  assert.deepEqual(await service.updateIPRangeSNMPCredential(21, 4), { success: true, id: 21, rank: 4 });
  assert.deepEqual(await service.detachSNMPCredentialFromIPRange(21), {
    success: true, id: 21, deleted: true, relation: { id: 21, rank: 4 },
  });
  assert.deepEqual(writes, [
    { itemtype: 'PluginGlpiinventoryIPRange_SNMPCredential', id: 21, payload: { rank: 4 } },
    { itemtype: 'PluginGlpiinventoryIPRange_SNMPCredential', id: 21, force: true },
  ]);
});

test('credential reads recursively remove password, secret and community fields', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  (client as any).getItem = async () => ({
    id: 7, name: 'VMware', username: 'svc', password: 'encrypted', nested: { community: 'private', visible: true },
  });
  const service = new LegacyInventoryPluginService(client);
  assert.deepEqual(await service.get('credentials', 7), {
    id: 7, name: 'VMware', username: 'svc', nested: { visible: true },
  });
});

test('task writes map booleans and friendly entity id to plugin fields', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let captured: unknown;
  (client as any).createItem = async (itemtype: string, payload: unknown) => {
    captured = { itemtype, payload };
    return { id: 9 };
  };
  const service = new LegacyInventoryPluginService(client);
  await service.createTask({
    name: 'Network discovery', entity_id: 10, is_active: false,
    reprepare_if_successful: true, is_deploy_on_demand: false,
  });
  assert.deepEqual(captured, {
    itemtype: 'PluginGlpiinventoryTask',
    payload: {
      name: 'Network discovery', entities_id: 10, is_active: 0,
      reprepare_if_successful: 1, is_deploy_on_demand: 0,
    },
  });
});

test('requeueTask cycles an active task and enables scheduler re-preparation', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const writes: unknown[] = [];
  (client as any).getItem = async () => ({ id: 9, is_active: 1, reprepare_if_successful: 0 });
  (client as any).updateItem = async (itemtype: string, id: number, payload: unknown) => {
    writes.push({ itemtype, id, payload });
  };
  const service = new LegacyInventoryPluginService(client);

  assert.deepEqual(await service.requeueTask(9), {
    success: true,
    id: 9,
    active: true,
    reprepare_if_successful: true,
    status: 'queued_for_scheduler',
  });
  assert.deepEqual(writes, [
    { itemtype: 'PluginGlpiinventoryTask', id: 9, payload: { is_active: 0 } },
    { itemtype: 'PluginGlpiinventoryTask', id: 9, payload: { reprepare_if_successful: 1 } },
    { itemtype: 'PluginGlpiinventoryTask', id: 9, payload: { is_active: 1 } },
  ]);
});
