import assert from 'node:assert/strict';
import test from 'node:test';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { LegacyOrganizationService, mapLegacyEntity, mapLegacyLocation } from '../src/api/legacy/organization.js';
import { HighLevelClient } from '../src/api/highlevel/client.js';
import { HighLevelApiError } from '../src/api/highlevel/client.js';
import { HighLevelOrganizationService, mapHighLevelEntity, mapHighLevelEntityUpdate, mapHighLevelLocation } from '../src/api/highlevel/organization.js';
import { GlpiError } from '../src/api/legacy/http.js';
import { entityCreateSchema, entityUpdateSchema } from '../src/core/organization/schemas.js';

const locationInput = {
  name: 'GB - Test', code: 'GB-T', alias: 'TEST', entityId: 11,
  recursive: true, parentLocationId: 1, address: '1 rue du Test',
  postcode: '63000', town: 'Test', country: 'France',
  latitude: 45.5, longitude: 3.7, altitude: 420,
};

const entityInput = {
  name: 'GB-T - Test', parentEntityId: 1, registrationNumber: 'GB-T',
  ldapDn: 'ou=ambert,ou=genbio,dc=example,dc=test',
  ldapFilter: '(&(objectClass=user)(company=BIOLYSS))', ldapDirectoryId: 4,
  inventoryTag: 'BIOLYSS-GUERET',
  address: '1 rue du Test', postcode: '63000', town: 'Test', country: 'France',
  latitude: 45.5, longitude: 3.7, altitude: 420,
  website: 'https://example.test', phone: '0102030405', email: 'test@example.test',
};

test('Entity schemas preserve exact DN values and validate LDAP directory IDs', () => {
  const exactDn = 'OU=LA-SOUTERRAINE,OU=Sites,OU=BIOLYSS,DC=inovie,DC=infra';
  assert.equal(entityCreateSchema.parse({ name: 'BL-2', ldap_dn: exactDn }).ldap_dn, exactDn);
  assert.equal(entityUpdateSchema.parse({ id: 81, ldap_dn: exactDn }).ldap_dn, exactDn);
  assert.throws(() => entityCreateSchema.parse({ name: 'BL-2', ldap_dn: '   ' }));
  assert.throws(() => entityUpdateSchema.parse({ id: 81, ldap_directory_id: -1 }));
  assert.equal(entityUpdateSchema.parse({ id: 81, ldap_directory_id: 0 }).ldap_directory_id, 0);
  assert.equal(entityUpdateSchema.parse({ id: 81, ldap_dn: null }).ldap_dn, null);
});

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
    ldap_dn: 'ou=ambert,ou=genbio,dc=example,dc=test',
    entity_ldapfilter: '(&(objectClass=user)(company=BIOLYSS))', authldaps_id: 4,
    tag: 'BIOLYSS-GUERET',
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

test('Legacy entity creation remains successful when its verification GET is forbidden', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let postCalls = 0;
  let getCalls = 0;
  (client as any).createItem = async () => {
    postCalls++;
    return { id: 80, message: 'Element ajouté' };
  };
  (client as any).getEntity = async () => {
    getCalls++;
    throw new GlpiError({
      status: 403,
      glpiCode: 'ERROR_RIGHT_MISSING',
      glpiMessage: "Vous n'avez pas les droits requis pour réaliser cette action.",
      body: '["ERROR_RIGHT_MISSING","forbidden"]',
      url: 'https://glpi.test/apirest.php/Entity/80',
      method: 'GET',
    });
  };

  const result = await new LegacyOrganizationService(client).createEntity(entityInput);

  assert.deepEqual(result, {
    success: true,
    id: 80,
    creation_message: 'Element ajouté',
    verification_status: 'failed',
    verification_error: 'ERROR_RIGHT_MISSING',
    verification_http_status: 403,
    verification_message: "Vous n'avez pas les droits requis pour réaliser cette action.",
  });
  assert.equal(postCalls, 1, 'the successful POST must never be repeated after GET failure');
  assert.equal(getCalls, 1);
});

test('Legacy location creation uses the same post-verification failure contract', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let postCalls = 0;
  (client as any).createLocation = async () => {
    postCalls++;
    return { id: 12 };
  };
  (client as any).getLocation = async () => {
    throw new GlpiError({
      status: 403,
      glpiCode: 'ERROR_RIGHT_MISSING',
      glpiMessage: 'Forbidden',
      body: '["ERROR_RIGHT_MISSING","Forbidden"]',
      url: 'https://glpi.test/apirest.php/Location/12',
      method: 'GET',
    });
  };

  assert.deepEqual(await new LegacyOrganizationService(client).createLocation(locationInput), {
    success: true,
    id: 12,
    verification_status: 'failed',
    verification_error: 'ERROR_RIGHT_MISSING',
    verification_http_status: 403,
    verification_message: 'Forbidden',
  });
  assert.equal(postCalls, 1);
});

test('Legacy entity creation still rejects when the POST itself fails', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let getCalls = 0;
  const postError = new GlpiError({
    status: 403,
    glpiCode: 'ERROR_RIGHT_MISSING',
    glpiMessage: 'POST forbidden',
    body: '["ERROR_RIGHT_MISSING","POST forbidden"]',
    url: 'https://glpi.test/apirest.php/Entity',
    method: 'POST',
  });
  (client as any).createItem = async () => { throw postError; };
  (client as any).getEntity = async () => { getCalls++; };

  await assert.rejects(
    () => new LegacyOrganizationService(client).createEntity(entityInput),
    (error: unknown) => error === postError
  );
  assert.equal(getCalls, 0, 'verification must not run when creation failed');
});

test('Legacy entity update reads first and sends only the explicitly supplied DN', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const calls: unknown[] = [];
  const exactDn = 'OU=LA-SOUTERRAINE,OU=Sites,OU=BIOLYSS,DC=inovie,DC=infra';
  (client as any).getEntity = async (id: number, options: unknown) => {
    calls.push(['GET', id, options]);
    return { id, name: 'BL-2 - La Souterraine', ldap_dn: exactDn, entity_ldapfilter: '', authldaps_id: 4, tag: 'BL-2' };
  };
  (client as any).updateItem = async (type: string, id: number, payload: unknown) => {
    calls.push(['PUT', type, id, payload]);
    return true;
  };

  const result = await new LegacyOrganizationService(client).updateEntity(81, { ldapDn: exactDn });

  assert.deepEqual(calls[1], ['PUT', 'Entity', 81, { ldap_dn: exactDn }]);
  assert.equal(calls.filter((call: any) => call[0] === 'GET').length, 2);
  assert.equal((result as any).ldap_dn, exactDn);
  assert.equal((result as any).ldap_filter, '');
  assert.equal((result as any).ldap_directory_id, 4);
  assert.equal((result as any).inventory_tag, 'BL-2');
});

test('Legacy entity update maps explicit LDAP clearing without touching other fields', () => {
  assert.deepEqual(mapLegacyEntity({ ldapDn: null }), { ldap_dn: '' });
  assert.deepEqual(mapLegacyEntity({ ldapDirectoryId: 0 }), { authldaps_id: 0 });
});

test('Legacy entity update reports successful write separately when verification fails', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let reads = 0;
  let writes = 0;
  (client as any).getEntity = async () => {
    reads++;
    if (reads === 1) return { id: 81, name: 'BL-2' };
    throw new GlpiError({
      status: 403, glpiCode: 'ERROR_RIGHT_MISSING', glpiMessage: 'Forbidden',
      body: '["ERROR_RIGHT_MISSING","Forbidden"]', url: 'https://glpi.test/apirest.php/Entity/81', method: 'GET',
    });
  };
  (client as any).updateItem = async () => { writes++; return true; };

  assert.deepEqual(await new LegacyOrganizationService(client).updateEntity(81, { ldapDn: 'OU=SITE,DC=inovie,DC=infra' }), {
    success: true,
    id: 81,
    update_status: 'succeeded',
    verification_status: 'failed',
    verification_error: 'ERROR_RIGHT_MISSING',
    verification_http_status: 403,
    verification_message: 'Forbidden',
  });
  assert.equal(writes, 1);
});

test('Legacy entity reads expose stable LDAP aliases and keep native fields', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  (client as any).getEntities = async (options: unknown) => [{
    id: 80, ldap_dn: 'OU=GUERET,DC=inovie,DC=infra', entity_ldapfilter: '(company=BIOLYSS)', authldaps_id: 4, tag: 'BL-1', options,
  }];
  const [entity] = await new LegacyOrganizationService(client).listEntities({}) as any[];
  assert.equal(entity.ldap_filter, '(company=BIOLYSS)');
  assert.equal(entity.ldap_directory_id, 4);
  assert.equal(entity.inventory_tag, 'BL-1');
  assert.equal(entity.authldaps_id, 4);
  assert.equal(entity.options.expand_dropdowns, false);
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
    ldap_dn: 'ou=ambert,ou=genbio,dc=example,dc=test',
    entity_ldapfilter: '(&(objectClass=user)(company=BIOLYSS))', authldap: { id: 4 },
    tag: 'BIOLYSS-GUERET',
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
  assert.deepEqual((requests[1]?.body as any).authldap, { id: 4 });
  assert.equal((requests[1]?.body as any).ldap_dn, entityInput.ldapDn);
  assert.equal(requests[2]?.method, 'GET');
});

test('High-Level entity partial update uses PATCH, reads before and verifies after', async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const exactDn = 'OU=LA-SOUTERRAINE,OU=Sites,OU=BIOLYSS,DC=inovie,DC=infra';
  const client = new HighLevelClient({
    url: 'https://glpi.test', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (input, init) => {
      requests.push({
        url: String(input), method: init?.method ?? 'GET',
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return new Response(JSON.stringify({ id: 81, ldap_dn: exactDn, authldap: { id: 4 }, tag: 'BL-2' }), { status: 200 });
    },
  });

  const result = await new HighLevelOrganizationService(client).updateEntity(81, { ldapDn: exactDn });

  assert.deepEqual(requests.map((request) => request.method), ['GET', 'PATCH', 'GET']);
  assert.deepEqual(requests[1]?.body, { ldap_dn: exactDn });
  assert.equal((result as any).ldap_directory_id, 4);
  assert.equal((result as any).inventory_tag, 'BL-2');
});

test('High-Level update maps explicit DN clearing', () => {
  assert.deepEqual(mapHighLevelEntityUpdate({ ldapDn: null }), { ldap_dn: '' });
  assert.deepEqual(mapHighLevelEntityUpdate({ ldapDirectoryId: 0 }), { authldap: { id: 0 } });
});

test('High-Level rejected LDAP field is explicit and is not silently dropped or verified', async () => {
  let calls = 0;
  const client = new HighLevelClient({
    url: 'https://glpi.test', apiVersion: '2.2',
    accessTokenProvider: { getAccessToken: async () => 'token' },
    fetchImpl: async (_input, init) => {
      calls++;
      if ((init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ id: 81 }), { status: 200 });
      return new Response(JSON.stringify({ detail: 'Property ldap_dn is not supported in API v2.2' }), { status: 400 });
    },
  });

  await assert.rejects(
    () => new HighLevelOrganizationService(client).updateEntity(81, { ldapDn: 'OU=SITE,DC=inovie,DC=infra' }),
    (error: unknown) => error instanceof HighLevelApiError && error.status === 400 && /not supported/.test(error.detail)
  );
  assert.equal(calls, 2, 'read-before-write and rejected PATCH only; no verification GET');
});
