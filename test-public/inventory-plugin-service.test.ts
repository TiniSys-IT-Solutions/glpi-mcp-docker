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
