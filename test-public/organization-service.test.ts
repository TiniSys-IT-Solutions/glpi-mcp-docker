import assert from 'node:assert/strict';
import test from 'node:test';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { LegacyOrganizationService, mapLegacyEntity, mapLegacyLocation } from '../src/api/legacy/organization.js';
import { HighLevelClient } from '../src/api/highlevel/client.js';
import { HighLevelOrganizationService, mapHighLevelEntity, mapHighLevelLocation } from '../src/api/highlevel/organization.js';

const locationInput = {
  name: 'GB - Test', code: 'GB-T', alias: 'TEST', entityId: 11,
  recursive: true, parentLocationId: 1, address: '1 rue du Test',
  postcode: '63000', town: 'Test', country: 'France',
  latitude: 45.5, longitude: 3.7, altitude: 420,
};

const entityInput = {
  name: 'GB-T - Test', parentEntityId: 1, registrationNumber: 'GB-T',
  address: '1 rue du Test', postcode: '63000', town: 'Test', country: 'France',
  latitude: 45.5, longitude: 3.7, altitude: 420,
  website: 'https://example.test', phone: '0102030405', email: 'test@example.test',
};

test('Legacy organization mapper exposes enriched location fields', () => {
  assert.deepEqual(mapLegacyLocation(locationInput), {
    name: 'GB - Test', code: 'GB-T', alias: 'TEST', entities_id: 11,
    is_recursive: 1, locations_id: 1, address: '1 rue du Test',
    postcode: '63000', town: 'Test', country: 'France',
    latitude: '45.5', longitude: '3.7', altitude: '420',
  });
});

test('Legacy entity mapper translates friendly hierarchy and contact fields', () => {
  assert.deepEqual(mapLegacyEntity(entityInput), {
    name: 'GB-T - Test', entities_id: 1, registration_number: 'GB-T',
    address: '1 rue du Test', postcode: '63000', town: 'Test', country: 'France',
    latitude: '45.5', longitude: '3.7', altitude: '420',
    website: 'https://example.test', phonenumber: '0102030405', email: 'test@example.test',
  });
});

test('Legacy organization creation reads back the created resource', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const writes: unknown[] = [];
  (client as any).createLocation = async (payload: unknown) => { writes.push(['Location', payload]); return { id: 12 }; };
  (client as any).createItem = async (itemtype: string, payload: unknown) => { writes.push([itemtype, payload]); return { id: 11 }; };
  (client as any).getLocation = async (id: number) => ({ id, name: 'GB - Test' });
  (client as any).getEntity = async (id: number) => ({ id, name: 'GB-T - Test' });
  const service = new LegacyOrganizationService(client);

  assert.deepEqual(await service.createLocation(locationInput), { success: true, id: 12, name: 'GB - Test' });
  assert.deepEqual(await service.createEntity(entityInput), { success: true, id: 11, name: 'GB-T - Test' });
  assert.equal(writes.length, 2);
});

test('High-Level mappers use official dropdown relations and schema field names', () => {
  assert.deepEqual(mapHighLevelLocation(locationInput), {
    name: 'GB - Test', code: 'GB-T', alias: 'TEST', entity: { id: 11 },
    is_recursive: true, parent: { id: 1 }, address: '1 rue du Test',
    postcode: '63000', town: 'Test', country: 'France',
    latitude: '45.5', longitude: '3.7', altitude: '420',
  });
  assert.deepEqual(mapHighLevelEntity(entityInput), {
    name: 'GB-T - Test', parent: { id: 1 }, registration_number: 'GB-T',
    address: '1 rue du Test', postcode: '63000', city: 'Test', country: 'France',
    latitude: '45.5', longitude: '3.7', altitude: '420',
    website: 'https://example.test', phone: '0102030405', email: 'test@example.test',
  });
});

test('High-Level organization creation uses official Administration and Dropdown routes', async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const client = new HighLevelClient({
    url: 'https://glpi.test', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (input, init) => {
      requests.push({
        url: String(input), method: init?.method ?? 'GET',
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    },
  });
  const service = new HighLevelOrganizationService(client);
  await service.createLocation(locationInput);
  await service.createEntity(entityInput);

  assert.equal(requests[0]?.url, 'https://glpi.test/api.php/v2.3/Dropdown/Location');
  assert.equal(requests[0]?.method, 'POST');
  assert.equal(requests[1]?.url, 'https://glpi.test/api.php/v2.3/Administration/Entity');
  assert.equal(requests[1]?.method, 'POST');
});
