import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyGovernanceService } from '../src/api/legacy/governance.js';
import { assetRelationDetachSchema, governanceAuditSchema } from '../src/core/governance/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

function fixture(seed: Record<string, any[]>) {
  const writes: any[] = [];
  return { writes, client: {
    async getItems(type: string) { return (seed[type] ?? []).map((row) => ({ ...row })); },
    async getItem(type: string, id: number) { const row = (seed[type] ?? []).find((value) => value.id === id); if (!row) throw new Error('not found'); return { ...row }; },
    async createItem(type: string, payload: any) { seed[type] ??= []; const id = 100 + seed[type].length; seed[type].push({ id, ...payload }); writes.push(['create', type, payload]); return { id }; },
    async deleteItem(type: string, id: number) { seed[type] = (seed[type] ?? []).filter((row) => row.id !== id); writes.push(['delete', type, id]); },
  } as any };
}

test('asset relation attach is idempotent and detach requires a fresh fingerprint', async () => {
  const mock = fixture({ Computer: [{ id: 1 }], Contract: [{ id: 2 }], Contract_Item: [] });
  const service = new LegacyGovernanceService(mock.client);
  const first: any = await service.attachAssetRelation({ itemtype: 'Computer', assetId: 1, kind: 'contract', relatedId: 2, correlationId: 'c' });
  assert.equal(first.verification_status, 'verified');
  const second: any = await service.attachAssetRelation({ itemtype: 'Computer', assetId: 1, kind: 'contract', relatedId: 2, correlationId: 'c' });
  assert.equal(second.idempotent, true);
  const preview: any = await service.previewDetachAssetRelation({ kind: 'contract', relationId: first.relation_id });
  await service.detachAssetRelation({ kind: 'contract', relationId: first.relation_id, previewFingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_RELATION_DETACH', correlationId: 'c' });
  assert.equal(mock.writes.filter((write) => write[0] === 'delete').length, 1);
});

test('dropdown usage reports audited references and duplicate audit normalizes names', async () => {
  const service = new LegacyGovernanceService(fixture({ Location: [{ id: 5, name: ' Paris ' }, { id: 6, name: 'paris' }], Computer: [{ id: 1, locations_id: 5 }], NetworkEquipment: [], Printer: [], Monitor: [], Phone: [], Peripheral: [], Appliance: [], Rack: [], Enclosure: [], PDU: [], PassiveDCEquipment: [], Unmanaged: [] }).client);
  const usage: any = await service.getDropdownUsage({ itemtype: 'Location', id: 5, start: 0, limit: 10 });
  assert.equal(usage.total, 1);
  const audit: any = await service.audit({ audit: 'dropdown_duplicates', limit: 100 });
  assert.ok(audit.duplicate_groups.some((group: any) => group.itemtype === 'Location'));
});

test('governance audits find incomplete, stale and unassigned records', async () => {
  const service = new LegacyGovernanceService(fixture({ Computer: [{ id: 1, name: 'pc', serial: '', locations_id: 0, states_id: 1, date_mod: '2020-01-01' }], Ticket: [{ id: 7, name: 'open', status: 1 }], Problem: [], Change: [] }).client);
  const incomplete: any = await service.audit({ audit: 'asset_completeness', itemtypes: ['Computer'], requiredFields: ['name', 'serial'], limit: 100 });
  assert.deepEqual(incomplete.findings[0].missing_fields, ['serial']);
  const stale: any = await service.audit({ audit: 'stale_assets', itemtypes: ['Computer'], days: 30, limit: 100 });
  assert.equal(stale.count, 1);
  const unassigned: any = await service.audit({ audit: 'unassigned_itil_items', limit: 100 });
  assert.equal(unassigned.findings[0].id, 7);
});

test('governance schemas and annotations enforce destructive confirmation', () => {
  assert.throws(() => assetRelationDetachSchema.parse({ relation: 'contract', relation_id: 1, preview_fingerprint: 'a'.repeat(64), confirmation: 'NO', correlation_id: '123e4567-e89b-42d3-a456-426614174000' }));
  assert.equal(governanceAuditSchema.parse({ audit: 'ticket_sla_risk' }).days, 90);
  assert.equal(toolAnnotations('glpi_preview_detach_asset_relation').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_detach_asset_relation').destructiveHint, true);
  assert.equal(toolAnnotations('glpi_attach_asset_relation').idempotentHint, true);
});
