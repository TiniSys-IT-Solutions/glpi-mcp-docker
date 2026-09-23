import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyAssetImportRuleService } from '../src/api/legacy/asset-import-rules.js';
import { assetRuleRestoreApplySchema, assetRuleSnapshotSchema } from '../src/core/asset-import-rules/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';
import { gzipSync } from 'node:zlib';
import { decodeAssetRuleSnapshotGzip } from '../src/core/asset-import-rules/snapshot-codec.js';

function clientFixture() {
  const rules = [{ id: 2, name: 'Printers', ranking: 20, is_active: 1, match: 'AND', sub_type: 'RuleImportAsset', entities_id: 0, is_recursive: 1 },
    { id: 1, name: 'Computers', ranking: 10, is_active: 0, match: 'OR', sub_type: 'RuleImportAsset', entities_id: 2, is_recursive: 0 }];
  const criteria: Record<number, any[]> = { 1: [{ id: 11, rules_id: 1, ranking: 1, criteria: 'itemtype', condition: 0, pattern: 'Computer' }],
    2: [{ id: 21, rules_id: 2, ranking: 1, criteria: 'mystery', condition: 999, pattern: 'x' }] };
  const actions: Record<number, any[]> = { 1: [{ id: 12, rules_id: 1, ranking: 1, action_type: 'assign', field: 'link_if_possible', value: '1' }], 2: [] };
  let writes = 0;
  return { writes: () => writes, client: {
    http: { async request(path: string) {
      if (path === 'RuleImportAsset') return { data: rules };
      const match = path.match(/^RuleImportAsset\/(\d+)\/(RuleCriteria|RuleAction)$/); if (!match) throw new Error(path);
      return { data: match[2] === 'RuleCriteria' ? criteria[Number(match[1])] : actions[Number(match[1])] };
    } },
    async getItem(_type: string, id: number) { const rule = rules.find((row) => row.id === id); if (!rule) throw new Error('not found'); return rule; },
    async createItem() { writes++; }, async updateItem() { writes++; }, async deleteItem() { writes++; },
  } as any };
}

const listInput = { includeCriteria: true, includeActions: true, fetchAll: true, start: 0, limit: 100 };

test('RuleImportAsset audit is ordered, complete and preserves unknown native criteria', async () => {
  const fixture = clientFixture(); const result: any = await new LegacyAssetImportRuleService(fixture.client).list(listInput);
  assert.deepEqual(result.rules.map((rule: any) => rule.id), [1, 2]);
  assert.equal(result.rules[0].criteria[0].condition_label, 'is');
  assert.deepEqual(result.rules[1].warnings, ['unknown_criterion:mystery']);
  assert.equal(fixture.writes(), 0);
});

test('snapshot fingerprint is deterministic outside capture time and rejects tampering', async () => {
  const service = new LegacyAssetImportRuleService(clientFixture().client);
  const first: any = await service.exportSnapshot(listInput); const second: any = await service.exportSnapshot(listInput);
  assert.equal(first.fingerprint, second.fingerprint); assert.notEqual(first.captured_at, undefined);
  assert.doesNotThrow(() => assetRuleSnapshotSchema.parse(first));
  const tampered = structuredClone(first); tampered.rules[0].name = 'changed';
  await assert.rejects(() => service.diffSnapshots(tampered, second), /fingerprint is invalid/);
});

test('restore preview is no-write, fingerprinted and apply remains fail-closed', async () => {
  const fixture = clientFixture(); const service = new LegacyAssetImportRuleService(fixture.client);
  const snapshot: any = await service.exportSnapshot(listInput);
  const preview: any = await service.previewRestore({ snapshot, restoreMode: 'exact', allowCreate: false, allowUpdate: false, allowDisable: false, allowDelete: false });
  assert.equal(preview.applicable, true); assert.match(preview.preview_fingerprint, /^[a-f0-9]{64}$/);
  const applied: any = await service.applyRestore({ snapshot, restoreMode: 'exact', allowCreate: false, allowUpdate: false, allowDisable: false, allowDelete: false,
    previewFingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_ASSET_IMPORT_RULE_RESTORE', correlationId: '123e4567-e89b-42d3-a456-426614174000' });
  assert.equal(applied.status, 'not_supported'); assert.equal(fixture.writes(), 0);
});

test('schemas and annotations enforce guarded restore behavior', () => {
  assert.throws(() => assetRuleRestoreApplySchema.parse({}));
  assert.equal(toolAnnotations('glpi_export_asset_import_rules').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_apply_restore_asset_import_rules').destructiveHint, true);
});

test('large snapshots can use bounded gzip/base64 without changing their fingerprint', async () => {
  const service = new LegacyAssetImportRuleService(clientFixture().client);
  const snapshot: any = await service.exportSnapshot(listInput);
  const encoded = gzipSync(Buffer.from(JSON.stringify(snapshot))).toString('base64');
  const decoded = decodeAssetRuleSnapshotGzip(encoded);
  assert.equal(decoded.fingerprint, snapshot.fingerprint);
  assert.deepEqual(decoded.rules, snapshot.rules);
  assert.throws(() => decodeAssetRuleSnapshotGzip('not-base64!'), /valid base64/);
});
