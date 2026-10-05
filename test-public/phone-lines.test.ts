import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyPhoneLineService } from '../src/api/legacy/phone-lines.js';
import { HighLevelPhoneLineService } from '../src/api/highlevel/phone-lines.js';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { HighLevelClient } from '../src/api/highlevel/client.js';
import { phoneLineCreateSchema, phoneLineUpdateSchema, phoneLineSimApplySchema } from '../src/core/phone-lines/schemas.js';
import { assetRelationAttachSchema } from '../src/core/governance/schemas.js';
import { metadataListSchema } from '../src/core/item-metadata/schemas.js';
import { catalogListSchema } from '../src/core/catalog/schemas.js';
import { HighLevelCatalogService } from '../src/api/highlevel/catalog.js';
import { LegacyCatalogService } from '../src/api/legacy/catalog.js';
import { HighLevelItemMetadataService } from '../src/api/highlevel/item-metadata.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

type Row = Record<string, unknown>;
function fixture() {
  const rows: Record<string, Row[]> = {
    Line: [{ id: 7, name: 'Office', entities_id: 2, caller_num: '+33 1 23', caller_name: 'Office', comment: 'Original', lineoperators_id: 1, linetypes_id: 1, locations_id: 1, users_id: 0, is_recursive: 0, is_deleted: 0 }, { id: 8, name: 'SIM line', entities_id: 2, caller_num: '1234', comment: '', is_deleted: 0 }],
    Entity: [{ id: 0, entities_id: 0 }, { id: 2, entities_id: 0 }, { id: 3, entities_id: 2 }, { id: 4, entities_id: 0 }],
    Computer: [{ id: 9, name: 'PC', entities_id: 2, is_deleted: 0 }, { id: 10, entities_id: 3 }, { id: 11, entities_id: 4 }],
    LineType: [{ id: 1, name: 'Fixed' }], LineOperator: [{ id: 1, entities_id: 2 }], Location: [{ id: 1, entities_id: 2 }], State: [{ id: 1, entities_id: 2 }],
    User: [{ id: 1 }], Group: [{ id: 1, entities_id: 2, is_itemgroup: 1 }],
    Item_Line: [], Item_DeviceSimcard: [{ id: 4, itemtype: 'Computer', items_id: 9, entities_id: 2, devicesimcards_id: 3, serial: 'ICCID', lines_id: 8, pin: 'SIM_SECRET_PIN', pin2: 'SIM_SECRET_PIN2', puk: 'SIM_SECRET_PUK', puk2: 'SIM_SECRET_PUK2', plugin_secret: 'CUSTOM_SIM_SECRET' }],
    Contract_Item: [{ id: 1, itemtype: 'Line', items_id: 7, contracts_id: 2 }], Document_Item: [], Infocom: [], Notepad: [], Log: [],
  };
  const writes: Array<{ type: string; id?: number; fields?: Row; purge?: boolean }> = [];
  let failVerification = false;
  const client = {
    getItems: async (type: string, opts: { range: string; is_deleted: boolean }) => { const [start, end] = opts.range.split('-').map(Number); return (rows[type] ?? []).filter((r) => Number(r.is_deleted ?? 0) === Number(opts.is_deleted)).slice(start, end + 1); },
    getItem: async (type: string, id: number) => {
      if (failVerification && writes.length > 0 && type === 'Line') throw new Error('Readback unavailable');
      const row = (rows[type] ?? []).find((r) => Number(r.id) === id);
      if (!row) throw new Error(`Missing ${type}/${id}`);
      return structuredClone(row);
    },
    createItem: async (type: string, fields: Row) => { const id = 100 + writes.length; rows[type].push({ ...fields, id }); writes.push({ type, fields }); return { id }; },
    updateItem: async (type: string, id: number, fields: Row) => { Object.assign(rows[type].find((r) => Number(r.id) === id)!, fields); writes.push({ type, id, fields }); },
    deleteItem: async (type: string, id: number, purge: boolean) => { rows[type] = rows[type].filter((r) => Number(r.id) !== id); writes.push({ type, id, purge }); },
  } as unknown as GlpiClient;
  return { rows, writes, client, service: new LegacyPhoneLineService(client), failReadback: () => { failVerification = true; } };
}

test('phone line filters use explicit friendly fields and preserve caller number formatting', async () => {
  const f = fixture();
  const result: any = await f.service.list({ entity_id: 2, caller_number: '+33 1 23', operator_id: 1, text_search: 'office', start: 0, limit: 1 });
  assert.equal(result.total, 1); assert.equal(result.lines[0].caller_number, '+33 1 23'); assert.equal(result.lines[0].operator_id, 1);
  assert.equal((await f.service.list({ caller_number: '1234' }) as any).lines[0].id, 8);
  assert.equal(f.writes.length, 0);
});

test('typed line creation validates references and maps only confirmed native fields', async () => {
  const f = fixture();
  const result: any = await f.service.create({ name: 'Extension', entity_id: 2, caller_number: '0012', caller_name: 'Desk', operator_id: 1, type_id: 1, location_id: 1, assigned_user_id: 1, group_ids: [1] });
  assert.equal(result.verification_status, 'verified');
  assert.deepEqual(f.writes[0].fields, { name: 'Extension', entities_id: 2, caller_num: '0012', caller_name: 'Desk', lineoperators_id: 1, linetypes_id: 1, locations_id: 1, users_id: 1, groups_id: [1] });
  await assert.rejects(() => f.service.create({ name: 'Bad', entity_id: 4, operator_id: 1 }), /outside/);
  assert.equal(f.writes.length, 1);
});

test('technician groups use native is_assign eligibility rather than ordinary item-group eligibility', async () => {
  const f = fixture();
  f.rows.Group.push({ id: 2, entities_id: 2, is_assign: 1, is_itemgroup: 0 });
  const result: any = await f.service.update({ line_id: 7, technician_group_ids: [2] });
  assert.equal(result.verification_status, 'verified');
  assert.deepEqual(f.writes[0].fields, { groups_id_tech: [2] });
  await assert.rejects(() => f.service.update({ line_id: 7, technician_group_ids: [1] }), /requested role/);
});

test('partial updates preserve existing fields and report completed writes when reread fails', async () => {
  const f = fixture(); f.failReadback();
  const result: any = await f.service.update({ line_id: 7, caller_name: 'New caller' });
  assert.equal(result.write_completed, true); assert.equal(result.verification_status, 'unavailable');
  assert.deepEqual(f.writes[0].fields, { caller_name: 'New caller' });
  assert.equal(f.rows.Line[0].caller_num, '+33 1 23');
});

test('comment append detects stale text and is idempotent on retry', async () => {
  const f = fixture(); const input = { line_id: 7, expected_comment: 'Original', text: 'Added' };
  await f.service.appendComment(input); assert.equal(f.rows.Line[0].comment, 'Original\nAdded');
  assert.equal((await f.service.appendComment(input) as any).idempotent, true);
  await assert.rejects(() => f.service.appendComment({ ...input, text: 'Wrong' }), /changed/);
  assert.equal(f.writes.length, 1);
});

test('direct links are idempotent, entity aware and allow only real descendants of recursive lines', async () => {
  const f = fixture();
  await f.service.attach({ line_id: 7, itemtype: 'Computer', item_id: 9 });
  assert.equal((await f.service.attach({ line_id: 7, itemtype: 'Computer', item_id: 9 }) as any).idempotent, true);
  await assert.rejects(() => f.service.attach({ line_id: 7, itemtype: 'Computer', item_id: 10 }), /scope/);
  f.rows.Line[0].is_recursive = 1;
  await f.service.attach({ line_id: 7, itemtype: 'Computer', item_id: 10 });
  await assert.rejects(() => f.service.attach({ line_id: 7, itemtype: 'Computer', item_id: 11 }), /scope/);
  assert.equal(f.writes.length, 2);
});

test('direct detach requires a fresh fingerprint and preserves SIM associations', async () => {
  const f = fixture(); f.rows.Item_Line.push({ id: 1, lines_id: 8, itemtype: 'Computer', items_id: 9 });
  const preview: any = await f.service.previewDetach(1);
  await assert.rejects(() => f.service.detach({ relation_id: 1, preview_fingerprint: 'a'.repeat(64), confirmation: 'I_HAVE_VERIFIED_THE_PHONE_LINE_DETACH' }), /stale/);
  const result: any = await f.service.detach({ relation_id: 1, preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_PHONE_LINE_DETACH' });
  assert.equal(result.verification_status, 'verified'); assert.equal(f.rows.Item_DeviceSimcard[0].lines_id, 8); assert.equal(f.rows.Line.length, 2);
  assert.equal(f.writes[0].type, 'Item_Line');
});

test('overview and bidirectional item views distinguish direct/SIM links and redact every SIM secret', async () => {
  const f = fixture(); f.rows.Item_Line.push({ id: 1, lines_id: 8, itemtype: 'Computer', items_id: 9 });
  const overview: any = await f.service.overview(8);
  assert.equal(overview.items.direct.length, 1); assert.equal(overview.items.simcards.length, 1);
  const view: any = await f.service.listItemLines({ itemtype: 'Computer', item_id: 9 });
  assert.equal(view.lines.length, 1);
  for (const value of [overview, view, await f.service.listItems(8), await f.service.previewSim({ simcard_relation_id: 4, line_id: 7 })]) {
    assert.doesNotMatch(JSON.stringify(value), /SIM_SECRET|CUSTOM_SIM_SECRET|"pin"|"puk"/);
  }
});

test('SIM reassignment/clearing writes only lines_id and preserves installation and secrets', async () => {
  const f = fixture();
  const preview: any = await f.service.previewSim({ simcard_relation_id: 4, line_id: 7 });
  const result: any = await f.service.setSim({ simcard_relation_id: 4, line_id: 7, preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_SIMCARD_PHONE_LINE' });
  assert.equal(result.verification_status, 'verified'); assert.deepEqual(f.writes[0].fields, { lines_id: 7 });
  assert.equal(f.rows.Item_DeviceSimcard[0].pin, 'SIM_SECRET_PIN'); assert.doesNotMatch(JSON.stringify(result), /SIM_SECRET/);
  const clear: any = await f.service.previewSim({ simcard_relation_id: 4, line_id: 0 });
  await f.service.setSim({ simcard_relation_id: 4, line_id: 0, preview_fingerprint: clear.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_SIMCARD_PHONE_LINE' });
  assert.equal(f.rows.Item_DeviceSimcard.length, 1); assert.equal(f.rows.Item_DeviceSimcard[0].lines_id, 0);
});

test('SIM ownership changes invalidate previews and linked lines cannot move entities', async () => {
  const f = fixture();
  const preview: any = await f.service.previewSim({ simcard_relation_id: 4, line_id: 7 });
  f.rows.Item_DeviceSimcard[0].items_id = 10; f.rows.Line[0].is_recursive = 1;
  await assert.rejects(() => f.service.setSim({ simcard_relation_id: 4, line_id: 7, preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_SIMCARD_PHONE_LINE' }), /stale/);
  await assert.rejects(() => f.service.update({ line_id: 8, entity_id: 4 }), /Remove equipment/);
  assert.equal(f.writes.length, 0);
});

test('entity changes revalidate persisted dropdowns and existing group assignments', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.update({ line_id: 7, entity_id: 4 }), /outside/);
  f.rows.Line[0].groups_id = [1];
  await assert.rejects(() => f.service.update({ line_id: 7, entity_id: 4, operator_id: 0, location_id: 0 }), /Group/);
  assert.equal(f.writes.length, 0);
});

test('audits flag potential same-entity duplicates and stats respect entity scope', async () => {
  const f = fixture(); f.rows.Line.push({ id: 12, name: 'Duplicate', entities_id: 2, caller_num: '+33123', is_deleted: 0 }, { id: 13, entities_id: 4, caller_num: '+33123', is_deleted: 0 });
  const audit: any = await f.service.audit({ entity_id: 2 });
  assert.ok(audit.findings.some((v: Row) => v.issue === 'potential_duplicate_number_in_entity'));
  assert.equal(audit.scanned_lines, 3);
  const stats: any = await f.service.stats({ entity_id: 2 }); assert.equal(stats.total, 3); assert.equal(stats.distributions.entity_id['2'], 3);
  assert.equal(f.writes.length, 0);
});

test('schemas accept Line metadata and dropdowns but reject unrelated Line relations and arbitrary line fields', () => {
  for (const itemtype of ['LineType', 'LineOperator']) assert.equal(catalogListSchema.parse({ domain: 'dropdown', itemtype }).itemtype, itemtype);
  assert.equal(metadataListSchema.parse({ kind: 'note', itemtype: 'Line', item_id: 7 }).itemtype, 'Line');
  assert.equal(assetRelationAttachSchema.parse({ relation: 'contract', itemtype: 'Line', asset_id: 7, related_id: 1, correlation_id: '00000000-0000-4000-8000-000000000001' }).itemtype, 'Line');
  assert.throws(() => assetRelationAttachSchema.parse({ relation: 'certificate', itemtype: 'Line', asset_id: 7, related_id: 1, correlation_id: '00000000-0000-4000-8000-000000000001' }));
  assert.throws(() => phoneLineCreateSchema.parse({ name: 'x', entity_id: 2, secret: 'x' }));
  assert.throws(() => phoneLineUpdateSchema.parse({ line_id: 7 }));
  assert.throws(() => phoneLineSimApplySchema.parse({ simcard_relation_id: 4, line_id: 7, preview_fingerprint: 'a'.repeat(64), confirmation: 'NO' }));
});

test('High-Level confirmed CRUD maps dropdown ids and unsupported relations fail before HTTP calls', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  const native: Row = { id: 7, name: 'Office', entity: { id: 2 }, caller_num: '1234', caller_name: '', comment: 'Old', is_deleted: false };
  const client = { apiVersion: 'v2.3', request: async (path: string, init: RequestInit = {}) => {
    calls.push({ path, method: init.method ?? 'GET', body: init.body as string });
    if (path === 'Administration/Entity/2') return { id: 2 };
    if (path.includes('?')) return [native];
    if (init.method === 'PATCH' || init.method === 'POST') { Object.assign(native, JSON.parse(String(init.body))); return native; }
    return native;
  } } as unknown as HighLevelClient;
  const service = new HighLevelPhoneLineService(client);
  assert.equal((await service.list({ caller_number: '1234' }) as any).lines[0].entity_id, 2);
  const result: any = await service.create({ name: 'New', entity_id: 2, caller_number: '0012' });
  assert.equal(result.verification_status, 'verified');
  const write = calls.find((call) => call.method === 'POST')!;
  assert.deepEqual(JSON.parse(write.body!), { name: 'New', entity: { id: 2 }, caller_num: '0012' });
  const count = calls.length;
  await assert.rejects(() => service.listItems(7), /Not supported/);
  await assert.rejects(() => service.overview(7), /Not supported/);
  await assert.rejects(() => service.previewSim({ simcard_relation_id: 4, line_id: 0 }), /Not supported/);
  assert.equal(calls.length, count);
});

test('unconfirmed High-Level operator routes and Line financial routes fail explicitly', async () => {
  let calls = 0;
  const client = { request: async () => { calls++; return []; } } as unknown as HighLevelClient;
  await assert.rejects(() => new HighLevelCatalogService(client).list({ domain: 'dropdown', itemtype: 'LineOperator', start: 0, limit: 10, fetchAll: false, includeDeleted: false }), /Not supported/);
  await assert.rejects(() => new HighLevelItemMetadataService(client).list({ kind: 'financial_info', itemtype: 'Line', itemId: 7 }), /Not supported/);
  assert.equal(calls, 0);
});

test('line dropdowns cannot be hard-deleted through the generic soft-delete workflow', async () => {
  const f = fixture();
  const service = new LegacyCatalogService(f.client);
  for (const itemtype of ['LineType', 'LineOperator']) {
    const selection = { domain: 'dropdown' as const, itemtype, id: 1, purge: false };
    const preview: any = await service.previewDelete(selection);
    assert.equal(preview.applicable, false);
    await assert.rejects(() => service.delete({ ...selection, previewFingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_CATALOG_DELETE', correlationId: 'test' }), /Deletion blocked/);
  }
  assert.equal(f.writes.length, 0);
});

test('operator code validation prevents invalid native integer writes', async () => {
  const f = fixture();
  await assert.rejects(() => new LegacyCatalogService(f.client).create({ domain: 'dropdown', itemtype: 'LineOperator', fields: { name: 'Operator', mcc: 'ABC' }, correlationId: 'test' }), /integer/);
  assert.equal(f.writes.length, 0);
});

test('unsupported High-Level API versions are rejected before any request', async () => {
  let calls = 0;
  const client = { apiVersion: 'v2.2', request: async () => { calls++; return []; } } as unknown as HighLevelClient;
  await assert.rejects(() => new HighLevelPhoneLineService(client).create({ name: 'Extension', entity_id: 2, caller_number: '0012' }), /requires_api_2.3/);
  assert.equal(calls, 0);
});

test('missing overview permissions are marked incomplete instead of presenting empty sections', async () => {
  const f = fixture();
  const getItems = f.client.getItems.bind(f.client);
  f.client.getItems = (async (type: string, options: any) => { if (type === 'Contract_Item') throw new Error('Contract access denied'); return getItems(type, options); }) as typeof f.client.getItems;
  const overview: any = await f.service.overview(7);
  assert.equal(overview.complete, false);
  assert.equal(overview.contracts.unavailable, true);
  assert.equal(overview.line.id, 7);
});

test('annotations keep audits read-only and direct/SIM removals destructive', () => {
  assert.equal(toolAnnotations('glpi_phone_lines_stats').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_audit_phone_lines').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_append_phone_line_comment').idempotentHint, true);
  assert.equal(toolAnnotations('glpi_attach_phone_line_to_item').destructiveHint, false);
  assert.equal(toolAnnotations('glpi_detach_phone_line_from_item').destructiveHint, true);
  assert.equal(toolAnnotations('glpi_set_simcard_phone_line').destructiveHint, true);
});
