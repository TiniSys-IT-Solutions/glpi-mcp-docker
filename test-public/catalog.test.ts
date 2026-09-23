import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyCatalogService } from '../src/api/legacy/catalog.js';
import { catalogDeleteSchema, catalogListSchema } from '../src/core/catalog/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

function fixture() {
  const rows: Record<string, any[]> = { NetworkEquipment: [{ id: 1, name: 'switch', is_deleted: 0 }] };
  const writes: any[] = [];
  return { writes, client: {
    async getItems(type: string) { return (rows[type] ?? []).map((row) => ({ ...row })); },
    async getItem(type: string, id: number) { const row = (rows[type] ?? []).find((item) => item.id === id); if (!row) throw new Error('not found'); return { ...row }; },
    async createItem(type: string, payload: any) { const id = 2; rows[type] ??= []; rows[type].push({ id, ...payload }); writes.push(['create', type, payload]); return { id }; },
    async updateItem(type: string, id: number, payload: any) { Object.assign((rows[type] ?? []).find((item) => item.id === id), payload); writes.push(['update', type, id, payload]); },
    async deleteItem(type: string, id: number) { const row = (rows[type] ?? []).find((item) => item.id === id); row.is_deleted = 1; writes.push(['delete', type, id]); },
  } as any };
}

test('catalog allowlist rejects mismatched domains and secret writes', async () => {
  assert.throws(() => catalogListSchema.parse({ domain: 'component', itemtype: 'Computer' }));
  const service = new LegacyCatalogService(fixture().client);
  await assert.rejects(() => service.update({ domain: 'asset', itemtype: 'NetworkEquipment', id: 1, fields: { password: 'secret' }, correlationId: '123e4567-e89b-42d3-a456-426614174000' }), /secret/);
});

test('catalog create and update return verified state', async () => {
  const mock = fixture(); const service = new LegacyCatalogService(mock.client);
  const created: any = await service.create({ domain: 'asset', itemtype: 'NetworkEquipment', fields: { name: 'router' }, correlationId: '123e4567-e89b-42d3-a456-426614174000' });
  assert.equal(created.verification_status, 'verified');
  const updated: any = await service.update({ domain: 'asset', itemtype: 'NetworkEquipment', id: 1, fields: { name: 'switch-1' }, correlationId: '123e4567-e89b-42d3-a456-426614174000' });
  assert.equal(updated.before.name, 'switch'); assert.equal(updated.after.name, 'switch-1');
});

test('DeviceMemory writes reject unknown columns and compare numeric GLPI strings semantically', async () => {
  const mock = fixture();
  (mock.client as any).createItem = async (type: string, payload: any) => { mock.writes.push(['create', type, payload]); return { id: 7 }; };
  (mock.client as any).getItem = async () => ({ id: 7, designation: 'RAM', size_default: '1024', frequence: '1866' });
  const service = new LegacyCatalogService(mock.client);
  await assert.rejects(() => service.create({ domain: 'component', itemtype: 'DeviceMemory', fields: { size: 1024 }, correlationId: '123e4567-e89b-42d3-a456-426614174000' }), /not a confirmed writable field/);
  const result: any = await service.create({ domain: 'component', itemtype: 'DeviceMemory', fields: { designation: 'RAM', size_default: 1024, frequence: 1866 }, correlationId: '123e4567-e89b-42d3-a456-426614174000' });
  assert.equal(result.verification_status, 'verified');
});

test('catalog delete requires a fresh preview and blocks purge without complete references', async () => {
  const mock = fixture(); const service = new LegacyCatalogService(mock.client);
  const preview: any = await service.previewDelete({ domain: 'asset', itemtype: 'NetworkEquipment', id: 1, purge: false });
  const result: any = await service.delete({ domain: 'asset', itemtype: 'NetworkEquipment', id: 1, purge: false, previewFingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_CATALOG_DELETE', correlationId: '123e4567-e89b-42d3-a456-426614174000' });
  assert.equal(result.verification_status, 'verified');
  const purge: any = await service.previewDelete({ domain: 'asset', itemtype: 'NetworkEquipment', id: 1, purge: true });
  await assert.rejects(() => service.delete({ domain: 'asset', itemtype: 'NetworkEquipment', id: 1, purge: true, previewFingerprint: purge.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_CATALOG_PURGE', correlationId: '123e4567-e89b-42d3-a456-426614174000' }), /Purge blocked/);
});

test('catalog schemas and annotations guard destructive operations', () => {
  assert.throws(() => catalogDeleteSchema.parse({ domain: 'asset', itemtype: 'Computer', id: 1, purge: true, preview_fingerprint: 'a'.repeat(64), confirmation: 'I_HAVE_VERIFIED_THE_CATALOG_DELETE', correlation_id: '123e4567-e89b-42d3-a456-426614174000' }));
  assert.equal(toolAnnotations('glpi_preview_delete_catalog_item').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_delete_catalog_item').destructiveHint, true);
});
