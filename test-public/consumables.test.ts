import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyCatalogService } from '../src/api/legacy/catalog.js';
import { HighLevelCatalogService } from '../src/api/highlevel/catalog.js';
import { LegacyConsumableService } from '../src/api/legacy/consumables.js';
import { HighLevelConsumableService } from '../src/api/highlevel/consumables.js';
import { consumableChangeSchema } from '../src/core/consumables/schemas.js';
import { catalogCreateSchema } from '../src/core/catalog/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';
import type { GlpiClient } from '../src/api/legacy/glpi-client.js';

const correlationId = '123e4567-e89b-42d3-a456-426614174000';
const confirmation = 'I_HAVE_VERIFIED_THE_CONSUMABLE_STOCK_CHANGE' as const;
function fixture() {
  const rows: Record<string, Record<string, unknown>[]> = {
    ConsumableItemType: [{ id: 1, name: 'Clavier' }],
    ConsumableItem: [{ id: 10, name: 'Clavier K120', ref: 'K120', entities_id: 2, locations_id: 3, manufacturers_id: 4, consumableitemtypes_id: 1, alarm_threshold: 2, stock_target: 5, is_deleted: 0 }],
    Consumable: [1, 2, 3].map((id) => ({ id, consumableitems_id: 10, date_in: '2026-10-23', date_out: null, itemtype: '', items_id: 0 })),
    Entity: [{ id: 0, entities_id: 0 }, { id: 2, entities_id: 0 }],
    Location: [{ id: 3, entities_id: 2 }], Manufacturer: [{ id: 4, name: 'Logitech' }],
    User: [{ id: 7, is_active: 1 }], Group: [{ id: 9, entities_id: 2 }],
    Profile_User: [{ id: 1, users_id: 7, entities_id: 2, profiles_id: 1, is_recursive: 0 }],
  };
  const writes: unknown[] = [];
  const client = {
    async getItems(type: string, options: { range?: string; is_deleted?: boolean } = {}) {
      let list = rows[type] ?? [];
      if (type === 'ConsumableItem') list = list.filter((row) => Boolean(row.is_deleted) === Boolean(options.is_deleted));
      const [start, end] = (options.range ?? '0-999').split('-').map(Number);
      return list.slice(start, end + 1).map((row) => ({ ...row }));
    },
    async getItem(type: string, id: number) {
      const row = (rows[type] ?? []).find((entry) => Number(entry.id) === id);
      if (!row) throw new Error(`${type} ${id} not found`);
      return { ...row };
    },
    async createItem(type: string, fields: Record<string, unknown>) {
      const id = Math.max(0, ...(rows[type] ?? []).map((entry) => Number(entry.id))) + 1;
      const extra = type === 'Consumable' ? { date_in: '2026-10-23', date_out: null, itemtype: '', items_id: 0 } : {};
      (rows[type] ??= []).push({ id, ...extra, ...fields }); writes.push(['POST', type, fields]); return { id };
    },
    async updateItem(type: string, id: number, fields: Record<string, unknown>) {
      Object.assign(rows[type].find((entry) => Number(entry.id) === id)!, fields); writes.push(['PUT', type, id, fields]); return true;
    },
  } as unknown as GlpiClient;
  return { rows, writes, client };
}

test('consumable types are allowed; previews reject case/whitespace duplicates without writing', async () => {
  catalogCreateSchema.parse({ domain: 'dropdown', itemtype: 'ConsumableItemType', fields: { name: 'Clavier' }, correlation_id: correlationId });
  const f = fixture(); const service = new LegacyCatalogService(f.client);
  const preview: any = await service.previewConsumableCreation({ domain: 'dropdown', itemtype: 'ConsumableItemType', fields: { name: ' CLAVIER ' } });
  assert.equal(preview.applicable, false); assert.equal(preview.duplicates[0].id, 1); assert.equal(preview.modifies_data, false);
  await assert.rejects(service.create({ domain: 'dropdown', itemtype: 'ConsumableItemType', fields: { name: 'clavier' }, correlationId }), /duplicate/);
  assert.equal(f.writes.length, 0);
});

test('consumable fields reject fake quantity/model/plugin columns, missing scope and invalid thresholds before writes', async () => {
  const f = fixture(); const service = new LegacyCatalogService(f.client);
  const fields = { name: 'Souris', entities_id: 2, consumableitemtypes_id: 1 };
  for (const invalid of [{ quantity: 20 }, { model: 'M100' }, { order_ref: 'CMD' }, { groups_id: 7 }, { alarm_threshold: null }, { alarm_threshold: -2 }, { stock_target: 1.5 }, { stock_target: 3 }, { manufacturers_id: '4' }]) {
    await assert.rejects(service.create({ domain: 'asset', itemtype: 'ConsumableItem', fields: { ...fields, ...invalid }, correlationId }));
  }
  await assert.rejects(service.create({ domain: 'asset', itemtype: 'ConsumableItem', fields: { name: 'Souris' }, correlationId }), /entities_id/);
  await assert.rejects(service.create({ domain: 'asset', itemtype: 'ConsumableItem', fields: { ...fields, manufacturers_id: 999 }, correlationId }), /not found/);
  assert.equal(f.writes.length, 0);
});

test('definitions preserve zero values, verify writes, detect trashed references and allow another storage location', async () => {
  const f = fixture(); const service = new LegacyCatalogService(f.client);
  const selection = { domain: 'asset' as const, itemtype: 'ConsumableItem' };
  const fields = { name: 'Souris M100', entities_id: 0, consumableitemtypes_id: 1, alarm_threshold: 0, stock_target: 0, is_recursive: true };
  const result: any = await service.create({ ...selection, fields, correlationId });
  assert.equal(result.verification_status, 'verified'); assert.equal(result.after.alarm_threshold, 0); assert.equal(result.after.is_recursive, 1); assert.equal(f.rows.Consumable.length, 3);
  f.rows.ConsumableItem.push({ id: 22, name: 'Ancien libellé', ref: 'ARCH', manufacturers_id: 4, entities_id: 2, locations_id: 3, is_deleted: 1 });
  const preview: any = await service.previewConsumableCreation({ ...selection, fields: { name: 'Autre libellé', ref: 'ARCH', manufacturers_id: 4, entities_id: 2, locations_id: 3, consumableitemtypes_id: 1 } });
  assert.equal(preview.applicable, false); assert.equal(preview.duplicates[0].is_deleted, 1);
  const other: any = await service.previewConsumableCreation({ ...selection, fields: { name: 'Clavier K120', ref: 'K120', manufacturers_id: 4, entities_id: 2, consumableitemtypes_id: 1 } });
  assert.equal(other.applicable, true);
});

test('partial threshold updates check the merged target and type deletion stays blocked', async () => {
  const f = fixture(); const service = new LegacyCatalogService(f.client);
  await assert.rejects(service.update({ domain: 'asset', itemtype: 'ConsumableItem', id: 10, fields: { alarm_threshold: 6 }, correlationId }), /stock_target/);
  const updated: any = await service.update({ domain: 'asset', itemtype: 'ConsumableItem', id: 10, fields: { alarm_threshold: 0 }, correlationId });
  assert.equal(updated.after.ref, 'K120'); assert.equal(updated.after.alarm_threshold, 0);
  const preview: any = await service.previewDelete({ domain: 'dropdown', itemtype: 'ConsumableItemType', id: 1, purge: false });
  assert.equal(preview.applicable, false);
  await assert.rejects(service.delete({ domain: 'dropdown', itemtype: 'ConsumableItemType', id: 1, purge: false, previewFingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_CATALOG_DELETE', correlationId }), /Deletion blocked/);
});

test('stock previews are read-only, additions create exact units and reject replay', async () => {
  const f = fixture(); const service = new LegacyConsumableService(f.client);
  const change = { action: 'add_stock' as const, consumable_item_id: 10, quantity: 2 };
  const preview: any = await service.previewChange(change);
  assert.equal(f.writes.length, 0);
  const result: any = await service.applyChange({ change, preview_fingerprint: preview.preview_fingerprint, confirmation, correlation_id: correlationId });
  assert.equal(result.success, true); assert.equal(result.verified_ids.length, 2); assert.equal(f.rows.Consumable.length, 5);
  await assert.rejects(service.applyChange({ change, preview_fingerprint: preview.preview_fingerprint, confirmation, correlation_id: correlationId }), /stale/);
  const stock: any = await service.getStock({ consumable_item_id: 10, start: 0, limit: 2 });
  assert.equal(stock.total, 5); assert.equal(stock.available, 5); assert.equal(stock.complete, false); assert.equal(stock.units.length, 2);
});

test('assignment and return handle multiple exact units and preserve native previous-recipient fields', async () => {
  const f = fixture(); const service = new LegacyConsumableService(f.client);
  const assign = { action: 'assign' as const, consumable_item_id: 10, consumable_ids: [1, 2], recipient_type: 'User' as const, recipient_id: 7, used_on: '2026-10-23' };
  const preview: any = await service.previewChange(assign);
  const applied: any = await service.applyChange({ change: assign, preview_fingerprint: preview.preview_fingerprint, confirmation, correlation_id: correlationId });
  assert.equal(applied.success, true); assert.deepEqual(applied.verified_ids, [1, 2]);
  const stock: any = await service.getStock({ consumable_item_id: 10, start: 0, limit: 100 });
  assert.equal(stock.available, 1); assert.equal(stock.assigned, 2); assert.equal(stock.below_alert_threshold, true); assert.equal(stock.suggested_replenishment, 4);
  const back = { action: 'return_to_stock' as const, consumable_item_id: 10, consumable_ids: [1, 2] };
  const p: any = await service.previewChange(back);
  const returned: any = await service.applyChange({ change: back, preview_fingerprint: p.preview_fingerprint, confirmation, correlation_id: correlationId });
  assert.equal(returned.success, true); assert.equal(f.rows.Consumable[0].date_out, null); assert.equal(f.rows.Consumable[0].items_id, 7);
});

test('assignment rejects foreign units, out-of-scope recipients and stale recipient memberships', async () => {
  const f = fixture(); const service = new LegacyConsumableService(f.client);
  const change = { action: 'assign' as const, consumable_item_id: 10, consumable_ids: [1], recipient_type: 'User' as const, recipient_id: 7, used_on: '2026-10-23' };
  await assert.rejects(service.previewChange({ ...change, consumable_ids: [999] }), /not in/);
  f.rows.Profile_User[0].entities_id = 33;
  await assert.rejects(service.previewChange(change), /membership/);
  f.rows.Profile_User[0].entities_id = 2;
  const preview: any = await service.previewChange(change);
  f.rows.User[0].is_active = 0;
  await assert.rejects(service.applyChange({ change, preview_fingerprint: preview.preview_fingerprint, confirmation, correlation_id: correlationId }), /inactive/);
  assert.equal(f.writes.length, 0);
  assert.throws(() => consumableChangeSchema.parse({ ...change, consumable_ids: [1, 1] }));
  assert.throws(() => consumableChangeSchema.parse({ ...change, used_on: '2026-02-30' }));
});

test('uncertain addition stops without retry; verified and written IDs remain distinguishable', async () => {
  const f = fixture(); const service = new LegacyConsumableService(f.client);
  const change = { action: 'add_stock' as const, consumable_item_id: 10, quantity: 3 };
  const preview: any = await service.previewChange(change);
  const create = f.client.createItem.bind(f.client); let calls = 0;
  f.client.createItem = async (type, fields) => { const result = await create(type, fields); if (++calls === 2) throw new Error('Connection lost after commit'); return result; };
  const result: any = await service.applyChange({ change, preview_fingerprint: preview.preview_fingerprint, confirmation, correlation_id: correlationId });
  assert.equal(result.success, false); assert.equal(result.outcome, 'incomplete_or_uncertain'); assert.equal(result.verified_ids.length, 1); assert.equal(calls, 2); assert.equal(f.rows.Consumable.length, 5);
  assert.match(result.retry_warning, /do_not_retry_blindly/);
});

test('High-Level uses the audited model path and rejects unvalidated stock writes without fallback', async () => {
  const paths: string[] = [];
  const catalog = new HighLevelCatalogService({ request: async (path: string) => { paths.push(path); return {}; } } as any);
  await catalog.get({ domain: 'asset', itemtype: 'ConsumableItem', id: 10 });
  assert.deepEqual(paths, ['Assets/Consumable/10']);
  await assert.rejects(catalog.create({ domain: 'asset', itemtype: 'ConsumableItem', fields: { name: 'Clavier' }, correlationId }), /not supported/i);
  await assert.rejects(new HighLevelConsumableService().previewChange({ action: 'add_stock', consumable_item_id: 10, quantity: 1 }), /not supported/i);
  assert.equal(paths.length, 1);
  assert.equal(toolAnnotations('glpi_preview_consumable_stock_change').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_apply_consumable_stock_change').destructiveHint, true);
  assert.equal(toolAnnotations('glpi_apply_consumable_stock_change').idempotentHint, false);
});

test('stock scans stop at safety cap and a local concurrent apply is rejected', async () => {
  const f = fixture(); const service = new LegacyConsumableService(f.client);
  const change = { action: 'add_stock' as const, consumable_item_id: 10, quantity: 1 };
  const preview: any = await service.previewChange(change);
  const originalCreate = f.client.createItem.bind(f.client);
  let release!: () => void; let entered!: () => void;
  const gated = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  f.client.createItem = async (type, fields) => { entered(); await gated; return originalCreate(type, fields); };
  const input = { change, preview_fingerprint: preview.preview_fingerprint, confirmation, correlation_id: correlationId };
  const first = service.applyChange(input);
  try { await started; await assert.rejects(service.applyChange(input), /in progress/); }
  finally { release(); }
  assert.equal((await first as any).success, true);
  f.client.getItems = async () => Array.from({ length: 1000 }, (_, index) => ({ id: index + 1, consumableitems_id: 10, date_out: null })) as any;
  await assert.rejects(service.previewChange(change), /safety cap/);
  assert.equal(f.writes.length, 1);
});

test('recursive recipient memberships are allowed, direct foreign groups are rejected', async () => {
  const f = fixture(); const service = new LegacyConsumableService(f.client);
  const change = { action: 'assign' as const, consumable_item_id: 10, consumable_ids: [1], recipient_type: 'Group' as const, recipient_id: 9, used_on: '2026-10-23' };
  f.rows.Group[0].entities_id = 0;
  await assert.rejects(service.previewChange(change), /membership/);
  f.rows.Group[0].is_recursive = 1;
  assert.equal((await service.previewChange(change) as any).applicable, true);
});

test('official MCP calls reach Legacy stock CRUD paths with native fields and no wizard route', { timeout: 20000 }, async () => {
  const { createServer } = await import('node:http');
  const { fileURLToPath } = await import('node:url');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const f = fixture(); const routes: string[] = [];
  const upstream = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    routes.push(`${request.method} ${url.pathname}`);
    response.setHeader('Content-Type', 'application/json');
    try {
      if (url.pathname === '/apirest.php/initSession') { response.end(JSON.stringify({ session_token: 'fixture-session' })); return; }
      if (url.pathname === '/apirest.php/killSession') { response.end('true'); return; }
      const [, , type, rawId] = url.pathname.split('/'); const id = Number(rawId);
      let value: unknown;
      if (request.method === 'GET') value = rawId
        ? await f.client.getItem(type, id, { expand_dropdowns: false })
        : await f.client.getItems(type, { range: url.searchParams.get('range') ?? '0-999' });
      else {
        let body = ''; for await (const chunk of request) body += chunk;
        const fields = JSON.parse(body).input;
        value = request.method === 'POST' ? await f.client.createItem(type, fields) : await f.client.updateItem(type, id, fields);
      }
      response.end(JSON.stringify(value));
    } catch (error) { response.statusCode = 400; response.end(JSON.stringify(['ERROR', String(error)])); }
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address(); assert.ok(address && typeof address !== 'string');
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    env: { GLPI_URL: `http://127.0.0.1:${address.port}`, GLPI_API_MODE: 'hybrid', GLPI_USER_TOKEN: 'synthetic-test-token', GLPI_MAX_RETRIES: '0' }, stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'consumable-routing-fixture', version: '1.0.0' });
  async function call(name: string, args: Record<string, unknown>) {
    const result: any = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  }
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.find((tool) => tool.name === 'glpi_apply_consumable_stock_change')?.annotations?.destructiveHint, true);
    const addedType = await call('glpi_create_catalog_item', { domain: 'dropdown', itemtype: 'ConsumableItemType', fields: { name: 'Souris' }, correlation_id: correlationId });
    assert.equal(addedType.verification_status, 'verified');
    const addition = { action: 'add_stock', consumable_item_id: 10, quantity: 1 };
    const preview = await call('glpi_preview_consumable_stock_change', addition);
    const added = await call('glpi_apply_consumable_stock_change', { change: addition, preview_fingerprint: preview.preview_fingerprint, confirmation, correlation_id: correlationId });
    assert.equal(added.success, true);
    const assignment = { action: 'assign', consumable_item_id: 10, consumable_ids: added.verified_ids, recipient_type: 'User', recipient_id: 7, used_on: '2026-10-23' };
    const p = await call('glpi_preview_consumable_stock_change', assignment);
    assert.equal((await call('glpi_apply_consumable_stock_change', { change: assignment, preview_fingerprint: p.preview_fingerprint, confirmation, correlation_id: correlationId })).success, true);
    const back = { action: 'return_to_stock', consumable_item_id: 10, consumable_ids: added.verified_ids };
    const rp = await call('glpi_preview_consumable_stock_change', back);
    assert.equal((await call('glpi_apply_consumable_stock_change', { change: back, preview_fingerprint: rp.preview_fingerprint, confirmation, correlation_id: correlationId })).success, true);
    const stock = await call('glpi_get_consumable_stock', { consumable_item_id: 10 });
    assert.equal(stock.available, 4);
    assert.ok(routes.includes('POST /apirest.php/ConsumableItemType'));
    assert.ok(routes.includes('POST /apirest.php/Consumable'));
    assert.ok(routes.includes(`PUT /apirest.php/Consumable/${added.verified_ids[0]}`));
    assert.ok(routes.every((route) => !route.includes('wizard') && !route.includes('/api.php/')));
    const puts = f.writes.filter((write) => Array.isArray(write) && write[0] === 'PUT') as any[];
    assert.deepEqual(puts.at(-1)[3], { date_out: null });
  } finally {
    await client.close(); upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
