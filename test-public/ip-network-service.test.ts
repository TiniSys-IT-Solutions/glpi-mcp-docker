import assert from 'node:assert/strict';
import test from 'node:test';
import { LegacyIPNetworkService, mapIPNetworkWriteInput } from '../src/api/legacy/ip-networks.js';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';

test('IP network mapper translates the business contract to GLPI fields', () => {
  assert.deepEqual(mapIPNetworkWriteInput({
    name: 'LAN production',
    cidr: '203.0.113.0/24',
    gateway: '203.0.113.254',
    entity_id: 42,
    is_recursive: true,
    addressable: true,
    comment: 'Managed LAN',
  }), {
    name: 'LAN production',
    network: '203.0.113.0/24',
    gateway: '203.0.113.254',
    entities_id: 42,
    is_recursive: 1,
    addressable: 1,
    comment: 'Managed LAN',
  });
});

test('LegacyIPNetworkService creates an IPNetwork with the mapped payload', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let capturedItemtype = '';
  let capturedPayload: unknown;

  (client as any).createItem = async (itemtype: string, payload: unknown) => {
    capturedItemtype = itemtype;
    capturedPayload = payload;
    return { id: 123 };
  };

  const service = new LegacyIPNetworkService(client);
  const result = await service.create({
    name: 'LAN users',
    cidr: '192.0.2.0/24',
    entity_id: 8,
    addressable: false,
  });

  assert.deepEqual(result, { id: 123 });
  assert.equal(capturedItemtype, 'IPNetwork');
  assert.deepEqual(capturedPayload, {
    name: 'LAN users',
    network: '192.0.2.0/24',
    entities_id: 8,
    addressable: 0,
  });
});

test('LegacyIPNetworkService lists and updates IPNetwork objects', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let listOptions: unknown;
  let updateCall: unknown;

  (client as any).getItems = async (itemtype: string, options: unknown) => {
    assert.equal(itemtype, 'IPNetwork');
    listOptions = options;
    return [{ id: 1 }];
  };
  (client as any).updateItem = async (itemtype: string, id: number, payload: unknown) => {
    updateCall = { itemtype, id, payload };
    return true;
  };

  const service = new LegacyIPNetworkService(client);
  assert.deepEqual(await service.list({ start: 10, limit: 5 }), [{ id: 1 }]);
  assert.deepEqual(listOptions, {
    range: '10-14',
    order: 'ASC',
    expand_dropdowns: true,
  });

  assert.deepEqual(await service.update(9, {
    cidr: '2001:db8::/64',
    gateway: '',
    is_recursive: false,
  }), { success: true, id: 9 });
  assert.deepEqual(updateCall, {
    itemtype: 'IPNetwork',
    id: 9,
    payload: {
      network: '2001:db8::/64',
      gateway: '',
      is_recursive: 0,
    },
  });
});
