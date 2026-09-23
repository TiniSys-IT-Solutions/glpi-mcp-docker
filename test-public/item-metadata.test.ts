import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyItemMetadataService } from '../src/api/legacy/item-metadata.js';
import { HighLevelItemMetadataService } from '../src/api/highlevel/item-metadata.js';
import { metadataDeleteSchema, metadataGetSchema } from '../src/core/item-metadata/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

function fixture(seed: Record<string, any[]>) {
  const writes: any[] = [];
  return { writes, client: {
    async getItems(type: string) { return (seed[type] ?? []).map((row) => ({ ...row })); },
    async getItem(type: string, id: number) { const row = (seed[type] ?? []).find((value) => value.id === id); if (!row) throw new Error('not found'); return { ...row }; },
    async createItem(type: string, payload: any) { seed[type] ??= []; const id = 100 + seed[type].length; seed[type].push({ id, ...payload }); writes.push(['create', type, payload]); return { id }; },
    async updateItem(type: string, id: number, payload: any) { Object.assign((seed[type] ?? []).find((value) => value.id === id), payload); writes.push(['update', type, id, payload]); },
    async deleteItem(type: string, id: number) { seed[type] = (seed[type] ?? []).filter((value) => value.id !== id); writes.push(['delete', type, id]); },
  } as any };
}

test('financial information is unique per item and uses Infocom', async () => {
  const mock = fixture({ Computer: [{ id: 1 }], Infocom: [] });
  const service = new LegacyItemMetadataService(mock.client);
  const created: any = await service.create({ kind: 'financial_info', itemtype: 'Computer', itemId: 1, fields: { buy_date: '2026-01-01', value: 1000 }, correlationId: 'c' });
  assert.equal(created.verification_status, 'verified'); assert.equal(mock.writes[0][1], 'Infocom');
  await assert.rejects(() => service.create({ kind: 'financial_info', itemtype: 'Computer', itemId: 1, fields: { value: 2 }, correlationId: 'c' }), /already exists/);
});

test('notes use exact parent/id and fingerprinted deletion', async () => {
  const mock = fixture({ Notepad: [{ id: 4, itemtype: 'Computer', items_id: 1, content: 'keep' }, { id: 5, itemtype: 'Computer', items_id: 2, content: 'other' }] });
  const service = new LegacyItemMetadataService(mock.client);
  const preview: any = await service.previewDelete({ kind: 'note', itemtype: 'Computer', itemId: 1, id: 4 });
  await service.delete({ kind: 'note', itemtype: 'Computer', itemId: 1, id: 4, previewFingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_ITEM_METADATA_DELETE', correlationId: 'c' });
  assert.deepEqual(mock.writes.at(-1), ['delete', 'Notepad', 4]);
});

test('High-Level metadata uses official Infocom and Note routes', async () => {
  const calls: string[] = [];
  const service = new HighLevelItemMetadataService({ async request(path: string) { calls.push(path); return { id: 1 }; } } as any);
  await service.list({ kind: 'financial_info', itemtype: 'Computer', itemId: 2 });
  await service.get({ kind: 'note', itemtype: 'Computer', itemId: 2, id: 7 });
  assert.deepEqual(calls, ['Assets/Computer/2/Infocom', 'Computer/2/Note/7']);
});

test('metadata schemas require note ids and destructive confirmation', () => {
  assert.throws(() => metadataGetSchema.parse({ kind: 'note', itemtype: 'Computer', item_id: 1 }));
  assert.throws(() => metadataDeleteSchema.parse({ kind: 'note', itemtype: 'Computer', item_id: 1, id: 2, preview_fingerprint: 'a'.repeat(64), confirmation: 'NO', correlation_id: '123e4567-e89b-42d3-a456-426614174000' }));
  assert.equal(toolAnnotations('glpi_delete_item_metadata').destructiveHint, true);
});
