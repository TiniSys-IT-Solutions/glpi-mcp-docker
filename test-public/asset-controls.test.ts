import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyAssetControlService } from '../src/api/legacy/asset-controls.js';
import { HighLevelAssetControlService } from '../src/api/highlevel/asset-controls.js';
import { assetTagDetachSchema } from '../src/core/asset-controls/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

function fixture() {
  const rows: Record<string, Record<string, unknown>[]> = {
    Printer: [{ id: 7, name: 'Example printer', serial: 'EXAMPLE-7' }],
    PluginTagTag: [{ id: 3, name: 'Managed', is_active: 1 }],
    PluginTagTagItem: [],
    Lockedfield: [],
  };
  const writes: unknown[] = [];
  return {
    writes,
    client: {
      async getItems(type: string) { return structuredClone(rows[type] ?? []); },
      async getItem(type: string, id: number) {
        const row = (rows[type] ?? []).find((candidate) => Number(candidate.id) === id);
        if (!row) throw new Error('not found');
        return structuredClone(row);
      },
      async createItem(type: string, payload: Record<string, unknown>) {
        const id = 100 + (rows[type]?.length ?? 0);
        rows[type] ??= [];
        rows[type].push({ id, ...payload });
        writes.push(['create', type, payload]);
        return { id };
      },
      async deleteItem(type: string, id: number) {
        rows[type] = (rows[type] ?? []).filter((row) => Number(row.id) !== id);
        writes.push(['delete', type, id]);
      },
    } as any,
  };
}

test('tag association is verified, idempotent and detaches only its relation', async () => {
  const f = fixture();
  const service = new LegacyAssetControlService(f.client);
  const input = { asset_type: 'Printer' as const, asset_id: 7, tag_id: 3 };
  const attached: any = await service.attachTag(input);
  assert.equal(attached.verification_status, 'verified');
  assert.equal((await service.attachTag(input) as any).idempotent, true);
  const detached: any = await service.detachTag(input);
  assert.equal(detached.action, 'detached_relation_only');
  assert.equal(detached.tag_deleted, false);
  assert.equal((await service.detachTag(input) as any).idempotent, true);
});

test('inventory locks preserve the asset field and reject unaudited fields', async () => {
  const f = fixture();
  const service = new LegacyAssetControlService(f.client);
  const input = { asset_type: 'Printer' as const, asset_id: 7, field: 'serial' };
  assert.equal((await service.lockInventoryField(input) as any).asset_value_unchanged, true);
  assert.equal((await service.lockInventoryField(input) as any).idempotent, true);
  assert.equal((await service.unlockInventoryField(input) as any).asset_value_unchanged, true);
  await assert.rejects(
    () => service.lockInventoryField({ ...input, field: 'password' }),
    /allowlist/,
  );
});

test('asset controls remain explicit in High-Level mode and guarded at the MCP boundary', async () => {
  const highLevel = new HighLevelAssetControlService();
  await assert.rejects(() => highLevel.listTags(), /no confirmed GLPI 11 High-Level route/);
  assert.throws(
    () => assetTagDetachSchema.parse({ asset_type: 'Printer', asset_id: 7, tag_id: 3 }),
    /confirmation/,
  );
  assert.equal(toolAnnotations('glpi_list_asset_tags').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_attach_tag_to_asset').destructiveHint, false);
  assert.equal(toolAnnotations('glpi_detach_tag_from_asset').destructiveHint, true);
});
