import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyLocationIntegrityService } from '../src/api/legacy/location-integrity.js';
import { assetLocationUpdateSchema, locationMappingSchema } from '../src/core/location-integrity/schemas.js';

function mockClient(seed: Record<string, any[]>) {
  const writes: any[] = []; const deletes: any[] = []; const creates: any[] = [];
  const client: any = {
    async getItems(type: string) { return (seed[type] ?? []).map((item) => ({ ...item })); },
    async getItem(type: string, id: number, options?: any) {
      const item = (seed[type] ?? []).find((candidate) => candidate.id === id);
      if (!item) throw new Error(`${type} ${id} not found`);
      if (options?.expand_dropdowns === false) return { ...item };
      return { ...item, locations_id: item.locations_id ? `Location ${item.locations_id}` : 0 };
    },
    async updateItem(type: string, id: number, payload: any) {
      writes.push([type, id, payload]); Object.assign((seed[type] ?? []).find((item) => item.id === id), payload); return true;
    },
    async deleteItem(type: string, id: number, purge: boolean) { deletes.push([type, id, purge]); return true; },
    async createItem(...args: any[]) { creates.push(args); throw new Error('must never create'); },
  };
  return { client, writes, deletes, creates };
}

const base = () => ({
  Location: [
    { id: 6, name: 'Office', completename: 'Site > Office', entities_id: 2, locations_id: 0, is_recursive: 0 },
    { id: 9, name: 'Target', completename: 'Site > Target', entities_id: 2, locations_id: 0, is_recursive: 0 },
    { id: 20, name: '6', completename: 'Site > 6', entities_id: 2, locations_id: 0, is_recursive: 0 },
  ],
  Entity: [{ id: 2, name: 'Example', entities_id: 0 }],
  Computer: [{ id: 1, name: 'PC', entities_id: 2, locations_id: 20 }],
  Monitor: [{ id: 2, name: 'Screen', entities_id: 2, locations_id: 20 }],
  Printer: [], NetworkEquipment: [], Phone: [], Peripheral: [], Appliance: [],
  User: [], Group: [], Ticket: [], Problem: [], Change: [], Project: [], Supplier: [], Contact: [],
  Log: [{ id: 1, itemtype: 'Location', items_id: 20, date_mod: '2026-01-01 05:00:01', users_id: 0, user_name: 'cron', old_value: '', new_value: '6', linked_action: 1, id_search_option: 1 }],
  AuthLDAP: [{ id: 1, name: 'Directory', location_field: 'physicalDeliveryOfficeName', rootdn_passwd: 'secret' }],
  CronTask: [],
});

test('location_id=6 assigns Location 6 by raw ID and never creates a numeric-named Location', async () => {
  const mock = mockClient(base()); const service = new LegacyLocationIntegrityService(mock.client);
  const result: any = await service.updateAsset({ itemtype: 'Computer', id: 1, locationId: 6 });
  assert.deepEqual(mock.writes, [['Computer', 1, { locations_id: 6 }]]);
  assert.equal(mock.creates.length, 0);
  assert.equal(result.update_status, 'succeeded'); assert.equal(result.verification_status, 'verified');
  assert.equal(result.before_raw.locations_id, 20); assert.equal(result.after_raw.locations_id, 6);
});

test('strict schemas reject names, NaN, empty updates and unconfirmed live reassignment', () => {
  assert.throws(() => assetLocationUpdateSchema.parse({ id: 1, location_id: 'Office' }));
  assert.throws(() => assetLocationUpdateSchema.parse({ id: 1, location_id: Number.NaN }));
  assert.throws(() => assetLocationUpdateSchema.parse({ id: 1 }));
  assert.throws(() => assetLocationUpdateSchema.parse({ id: 1, correlation_id: '123e4567-e89b-42d3-a456-426614174000' }));
  assert.throws(() => locationMappingSchema.parse({ mapping: [{ old_location_id: 20, new_location_id: 6 }], itemtypes: ['Computer'], dry_run: false }));
});

test('asset assignment rejects a Location outside the asset entity', async () => {
  const data = base(); data.Location.push({ id: 40, name: 'Foreign', entities_id: 3, locations_id: 0, is_recursive: 0 });
  data.Entity.push({ id: 3, name: 'Other', entities_id: 0 });
  const mock = mockClient(data);
  await assert.rejects(() => new LegacyLocationIntegrityService(mock.client).updateAsset({
    itemtype: 'Computer', id: 1, locationId: 40,
  }), /not available/);
  assert.equal(mock.writes.length, 0);
});

test('ambiguous normalized location resolution returns candidates and never creates', async () => {
  const data = base(); data.Location.push({ id: 21, name: 'OFFICE', completename: 'Office', entities_id: 2, locations_id: 0, is_recursive: 0 });
  const mock = mockClient(data); const result: any = await new LegacyLocationIntegrityService(mock.client).resolveLocation({ name: 'office', entityId: 2 });
  assert.equal(result.status, 'ambiguous'); assert.equal(mock.creates.length, 0);
});

test('dry-run reassignment changes neither assets nor Location count', async () => {
  const data = base(); const mock = mockClient(data); const before = data.Location.length;
  const result: any = await new LegacyLocationIntegrityService(mock.client).reassignAssets({
    mapping: [{ oldLocationId: 20, newLocationId: 6 }], itemtypes: ['Computer', 'Monitor'], dryRun: true,
    batchSize: 50, continueOnError: false,
  });
  assert.equal(result.ready, 2); assert.equal(mock.writes.length, 0); assert.equal(data.Location.length, before);
});

test('live reassignment propagates its correlation id and honours bounded batches', async () => {
  const data = base(); const mock = mockClient(data); const service = new LegacyLocationIntegrityService(mock.client);
  const correlationId = '123e4567-e89b-42d3-a456-426614174000';
  const result: any = await service.reassignAssets({
    mapping: [{ oldLocationId: 20, newLocationId: 6 }], itemtypes: ['Computer', 'Monitor'], dryRun: false,
    batchSize: 1, continueOnError: false, correlationId,
    confirmation: 'I_HAVE_VERIFIED_THE_ASSET_LOCATION_MAPPING',
  });
  assert.equal(result.operation_id, correlationId); assert.equal(result.results.length, 2);
  assert.ok(result.results.every((entry: any) => entry.operation_id === correlationId));
});

test('Location deletion is blocked by asset references or children', async () => {
  const mock = mockClient(base()); const result: any = await new LegacyLocationIntegrityService(mock.client).deleteLocation({ locationId: 20, dryRun: true, purge: false });
  assert.equal(result.can_delete, false); assert.ok(result.references.Computer); assert.equal(mock.deletes.length, 0);
});

test('batch deletion validates every Location before the first delete', async () => {
  const data = base(); data.Location.push({ id: 30, name: 'Unused', entities_id: 2, locations_id: 0 });
  const mock = mockClient(data); const service = new LegacyLocationIntegrityService(mock.client);
  await assert.rejects(() => service.deleteUnusedLocations({
    locationIds: [30, 20], dryRun: false, purge: false, confirmation: 'I_HAVE_VERIFIED_THE_LOCATION_DELETION',
  }), /no write performed/);
  assert.equal(mock.deletes.length, 0);
});

test('history identifies automatic activity and LDAP reads redact passwords', async () => {
  const service = new LegacyLocationIntegrityService(mockClient(base()).client);
  const history: any = await service.listItemHistory({ itemtype: 'Location', item_id: 20 });
  assert.equal(history[0].is_automatic, true); assert.equal(history[0].source, 'automatic_or_cron');
  const ldap: any = await service.listLdapDirectories({});
  assert.equal(ldap[0].rootdn_passwd, '[REDACTED]'); assert.ok(!JSON.stringify(ldap).includes('secret'));
});
