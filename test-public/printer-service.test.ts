import assert from 'node:assert/strict';
import test from 'node:test';
import { LegacyPrinterService, legacyPrinterUpdatePayload } from '../src/api/legacy/printers.js';
import { HighLevelPrinterService } from '../src/api/highlevel/printers.js';
import { appendPrinterCommentSchema, printerUpdateSchema, reassignPrintersSchema } from '../src/core/assets/schemas.js';
import { cidrContainsIPv4, selectPrinterBusinessIP } from '../src/core/assets/printer-utils.js';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';

test('printer mapper converts every friendly field and preserves omitted fields', () => {
  assert.deepEqual(legacyPrinterUpdatePayload({
    entityId: 2, locationId: 3, name: 'Printer', serial: null, inventoryNumber: 'INV',
    comment: null, stateId: 4, manufacturerId: 5, modelId: 6, printerTypeId: 7,
    networkId: 8, assignedUserId: 9, assignedTechnicianId: 10, contact: 'Alice',
    contactNumber: null, memorySize: 256, recursive: true, global: false,
  }), {
    entities_id: 2, locations_id: 3, name: 'Printer', serial: '', otherserial: 'INV',
    comment: '', states_id: 4, manufacturers_id: 5, printermodels_id: 6,
    printertypes_id: 7, networks_id: 8, users_id: 9, users_id_tech: 10,
    contact: 'Alice', contact_num: '', memory_size: 256, is_recursive: 1, is_global: 0,
  });
  assert.deepEqual(legacyPrinterUpdatePayload({ name: 'Only this' }), { name: 'Only this' });
});

test('printer schemas reject empty and invalid changes and enforce live confirmation', () => {
  assert.throws(() => printerUpdateSchema.parse({ id: 1 }));
  assert.throws(() => printerUpdateSchema.parse({ id: 0, name: 'x' }));
  assert.throws(() => printerUpdateSchema.parse({ id: 1, name: '   ' }));
  assert.throws(() => printerUpdateSchema.parse({ id: 1, location_id: -1 }));
  assert.equal(printerUpdateSchema.parse({ id: 1, comment: null }).comment, null);
  assert.equal(appendPrinterCommentSchema.parse({ printer_id: 1, text: 'old place' }).separator, '\n');
  assert.throws(() => appendPrinterCommentSchema.parse({ printer_id: 1, text: '  ' }));
  assert.equal(reassignPrintersSchema.parse({}).dry_run, true);
  assert.throws(() => reassignPrintersSchema.parse({ dry_run: false }));
  assert.equal(reassignPrintersSchema.parse({
    dry_run: false, confirmation: 'I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN',
  }).dry_run, false);
});

test('Legacy printer update reads first, validates references, writes only requested fields and verifies', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  const reads: Array<[string, number]> = [];
  const writes: unknown[] = [];
  let printer = { id: 12, name: 'P', entities_id: 2, locations_id: 3, comment: 'keep', manufacturers_id: 4 };
  (client as any).getItem = async (type: string, id: number) => {
    reads.push([type, id]);
    if (type === 'Printer') return { ...printer };
    if (type === 'Location') return { id, entities_id: 5, is_recursive: 0 };
    return { id };
  };
  (client as any).updateItem = async (type: string, id: number, payload: Record<string, unknown>) => {
    writes.push([type, id, payload]); printer = { ...printer, ...payload } as typeof printer;
  };
  const service = new LegacyPrinterService(client);
  const result = await service.update(12, { entityId: 5, locationId: 8, manufacturerId: 9, comment: null }) as any;
  assert.deepEqual(writes, [['Printer', 12, { entities_id: 5, locations_id: 8, comment: '', manufacturers_id: 9 }]]);
  assert.equal(result.before.comment, 'keep');
  assert.equal(result.after.comment, '');
  assert.ok(reads.some(([type, id]) => type === 'Entity' && id === 5));
  assert.ok(reads.some(([type, id]) => type === 'Manufacturer' && id === 9));
});

test('printer update rejects incompatible locations and accepts recursively inherited locations', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let recursive = 0;
  let writes = 0;
  let printerLocation = 0;
  (client as any).getItem = async (type: string, id: number) => {
    if (type === 'Printer') return { id, entities_id: 5, locations_id: printerLocation };
    if (type === 'Location') return { id, entities_id: 2, is_recursive: recursive };
    if (type === 'Entity' && id === 5) return { id, entities_id: 2 };
    return { id, entities_id: 0 };
  };
  (client as any).updateItem = async (_type: string, _id: number, payload: any) => { writes++; printerLocation = payload.locations_id; };
  const service = new LegacyPrinterService(client);
  await assert.rejects(() => service.update(1, { locationId: 8 }), /not recursively available/);
  recursive = 1;
  await service.update(1, { locationId: 8 });
  assert.equal(writes, 1);
});

test('comment append handles empty/existing comments, custom separators and idempotence', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let comment = '';
  let writes = 0;
  (client as any).getItem = async () => ({ id: 1, comment });
  (client as any).updateItem = async (_type: string, _id: number, payload: any) => { writes++; comment = payload.comment; };
  const service = new LegacyPrinterService(client);
  assert.equal((await service.appendComment(1, { text: 'first' }) as any).comment, 'first');
  assert.equal((await service.appendComment(1, { text: 'second', separator: ' | ' }) as any).comment, 'first | second');
  const duplicate = await service.appendComment(1, { text: 'second' }) as any;
  assert.equal(duplicate.already_present, true);
  assert.equal(writes, 2);
});

test('printer IP selection deduplicates, prefers 10/8 and excludes technical addresses', () => {
  assert.deepEqual(selectPrinterBusinessIP(['192.168.223.1', '10.1.2.3', '10.1.2.3', '172.16.0.2']), { status: 'ok', ip: '10.1.2.3' });
  assert.equal(selectPrinterBusinessIP(['10.1.2.3', '10.1.2.4']).status, 'ambiguous_ip');
  assert.equal(selectPrinterBusinessIP(['156.152.79.229']).status, 'no_ip');
  assert.equal(cidrContainsIPv4('10.1.0.0/16', '10.1.2.3'), true);
  assert.equal(cidrContainsIPv4('10.1.0.0/24', '10.1.2.3'), false);
});

function orchestrationClient(options: { active?: boolean; rules?: number; actions?: any[] } = {}) {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let writes = 0;
  const printer: any = { id: 1, name: 'P1', entities_id: 0, locations_id: 4, comment: 'existing' };
  (client as any).getItems = async (type: string) => type === 'Printer' ? [printer] : Array.from({ length: options.rules ?? 1 }, (_, index) => ({
    id: 90 + index, name: `Rule ${index}`, is_active: options.active === false ? 0 : 1,
  }));
  (client as any).getItem = async (type: string, id: number) => {
    if (type === 'Printer') return { ...printer };
    if (type === 'Location') return { id, name: `Location ${id}`, completename: `Site > Location ${id}`, entities_id: id === 4 ? 0 : 2, is_recursive: 0 };
    if (type === 'Entity') return { id, entities_id: 0 };
    return { id };
  };
  (client as any).updateItem = async (_type: string, _id: number, payload: any) => { writes++; Object.assign(printer, payload); };
  (client.http as any).request = async (path: string) => {
    if (path.includes('/RuleCriteria')) return { data: [{ id: 1, criteria: 'subnet', condition: 333, pattern: '10.63.170.0/24' }] };
    if (path.includes('/RuleAction')) return { data: options.actions ?? [
      { field: 'entities_id', value: 2 }, { field: 'locations_id', value: 12 },
    ] };
    if (path === 'Printer/1/NetworkPort') return { data: [{ id: 20 }] };
    if (path === 'NetworkPort/20/NetworkName') return { data: [{ id: 30 }] };
    if (path === 'NetworkName/30/IPAddress') return { data: [{ name: '10.63.170.42' }, { name: '192.168.223.1' }] };
    return { data: [] };
  };
  return { client, writes: () => writes, printer };
}

test('printer reassignment dry-run matches CIDR without writing and reports invalid cases', async () => {
  const good = orchestrationClient();
  const report = await new LegacyPrinterService(good.client).reassignFromImportEntityRules({
    dryRun: true, preservePreviousLocationInComment: true, commentPrefix: 'Ancien lieu GLPI : ',
  }) as any;
  assert.equal(report.results[0].status, 'ready');
  assert.equal(report.results[0].target_entity_id, 2);
  assert.equal(good.writes(), 0);

  const overlap = orchestrationClient({ rules: 2 });
  assert.equal((await new LegacyPrinterService(overlap.client).reassignFromImportEntityRules({ dryRun: true, preservePreviousLocationInComment: true, commentPrefix: 'old: ' }) as any).results[0].status, 'multiple_matching_rules');
  const inactive = orchestrationClient({ active: false });
  assert.equal((await new LegacyPrinterService(inactive.client).reassignFromImportEntityRules({ dryRun: true, preservePreviousLocationInComment: true, commentPrefix: 'old: ' }) as any).results[0].status, 'rule_inactive');
  const missingAction = orchestrationClient({ actions: [{ field: 'entities_id', value: 2 }] });
  assert.equal((await new LegacyPrinterService(missingAction.client).reassignFromImportEntityRules({ dryRun: true, preservePreviousLocationInComment: true, commentPrefix: 'old: ' }) as any).results[0].status, 'invalid_rule_actions');
});

test('confirmed printer reassignment preserves old location comment and is relaunchable', async () => {
  const mock = orchestrationClient();
  const service = new LegacyPrinterService(mock.client);
  const request = {
    dryRun: false, preservePreviousLocationInComment: true, commentPrefix: 'Ancien lieu GLPI : ',
    confirmation: 'I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN' as const,
  };
  const first = await service.reassignFromImportEntityRules(request) as any;
  assert.equal(first.results[0].status, 'updated');
  assert.equal(mock.printer.entities_id, 2);
  assert.equal(mock.printer.locations_id, 12);
  assert.equal(mock.printer.comment, 'existing\nAncien lieu GLPI : Site > Location 4');
  const second = await service.reassignFromImportEntityRules(request) as any;
  assert.equal(second.results[0].status, 'already_correct');
  assert.equal(mock.writes(), 1);
});

test('printer reassignment isolates one printer error and continues with the others', async () => {
  const mock = orchestrationClient();
  (mock.client as any).getItems = async (type: string) => type === 'Printer'
    ? [{ id: 1, name: 'P1', entities_id: 0, locations_id: 4 }, { id: 2, name: 'P2', entities_id: 0, locations_id: 4 }]
    : [{ id: 90, name: 'Rule', is_active: 1 }];
  const originalGetItem = (mock.client as any).getItem;
  (mock.client as any).getItem = async (type: string, id: number) => {
    if (type === 'Printer' && id === 2) return { id: 2, name: 'P2', entities_id: 0, locations_id: 4 };
    return originalGetItem(type, id);
  };
  const originalRequest = (mock.client.http as any).request;
  (mock.client.http as any).request = async (path: string) => {
    if (path === 'Printer/2/NetworkPort') throw new Error('simulated per-printer read failure');
    return originalRequest(path);
  };
  const report = await new LegacyPrinterService(mock.client).reassignFromImportEntityRules({
    dryRun: true, preservePreviousLocationInComment: true, commentPrefix: 'old: ',
  }) as any;
  assert.equal(report.results[0].status, 'ready');
  assert.equal(report.results[1].status, 'error');
  assert.equal(report.errors, 1);
  assert.equal(mock.writes(), 0);
});

test('High-Level printer writes fail explicitly until Swagger support is confirmed', async () => {
  const service = new HighLevelPrinterService();
  await assert.rejects(() => service.update(1, { name: 'P' }), /not supported/i);
  await assert.rejects(() => service.appendComment(1, { text: 'x' }), /not supported/i);
  await assert.rejects(() => service.reassignFromImportEntityRules({ dryRun: true, preservePreviousLocationInComment: true, commentPrefix: '' }), /not supported/i);
});
