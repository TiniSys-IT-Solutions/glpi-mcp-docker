import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyUnmanagedReconciliationService, normalizeHost, normalizeIp, normalizeMac } from '../src/api/legacy/unmanaged-reconciliation.js';
import { HighLevelUnmanagedReconciliationService } from '../src/api/highlevel/unmanaged-reconciliation.js';
import { unmanagedApplySchema, unmanagedAuditSchema } from '../src/core/unmanaged-reconciliation/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

function mockClient(data: Record<string, any[]>) {
  let writes = 0;
  return { writes: () => writes, client: {
    async getItems(type: string) { return (data[type] ?? []).map((item) => ({ ...item })); },
    async getItem(type: string, id: number) { const item = (data[type] ?? []).find((row) => row.id === id); if (!item) throw new Error('not found'); return { ...item }; },
    async updateItem() { writes++; }, async createItem() { writes++; }, async deleteItem() { writes++; },
  } as any };
}

const request = (overrides: Record<string, unknown> = {}) => ({ entityId: undefined, recursive: false, limit: 100,
  fetchAll: false, maxRows: 1000, assetTypes: ['Computer', 'Printer', 'NetworkEquipment', 'Phone'] as any,
  minimumConfidence: 'low' as const, includeUnmatched: true, ...overrides });
const seed = () => ({ Entity: [], Unmanaged: [], Computer: [], Printer: [], NetworkEquipment: [], Phone: [], Peripheral: [] } as Record<string, any[]>);

test('normalizes MAC, IP and FQDN deterministically', () => {
  assert.equal(normalizeMac('AA:BB:CC:DD:EE:FF'), 'aabbccddeeff');
  assert.equal(normalizeIp('[2001:DB8::1]'), '2001:db8::1');
  assert.equal(normalizeHost(' HOST.Example. '), 'host.example');
});

test('exact serial and non-blacklisted MAC are strong, explainable matches', async () => {
  const data = seed(); data.Unmanaged.push({ id: 1, name: 'node', serial: ' SN-42 ', mac: 'aa:bb:cc:dd:ee:ff' });
  data.Computer.push({ id: 9, name: 'node.example', serial: 'sn-42', mac: 'AA-BB-CC-DD-EE-FF' });
  const mock = mockClient(data); const result: any = await new LegacyUnmanagedReconciliationService(mock.client).audit(request());
  assert.equal(result.results[0].verdict, 'exact_match'); assert.equal(result.results[0].confidence, 'high');
  assert.deepEqual(result.results[0].matching_evidence.map((e: any) => e.field).slice(0, 2), ['serial', 'mac']);
  assert.equal(mock.writes(), 0);
});

test('IP alone is never an exact match', async () => {
  const data = seed(); data.Unmanaged.push({ id: 1, name: '192.0.2.10', ip: '192.0.2.10' });
  data.Printer.push({ id: 2, name: 'printer', ip: '192.0.2.10' });
  const result: any = await new LegacyUnmanagedReconciliationService(mockClient(data).client).audit(request());
  assert.equal(result.results[0].verdict, 'probable_match'); assert.equal(result.results[0].confidence, 'low');
});

test('shared IP with contradictory serial is a conflict', async () => {
  const data = seed(); data.Unmanaged.push({ id: 1, name: 'device-a', ip: '192.0.2.20', serial: 'one' });
  data.NetworkEquipment.push({ id: 2, name: 'device-b', ip: '192.0.2.20', serial: 'two' });
  const result: any = await new LegacyUnmanagedReconciliationService(mockClient(data).client).audit(request());
  assert.equal(result.results[0].verdict, 'conflict'); assert.ok(result.results[0].candidates[0].conflicts.includes('different_non_generic_serial'));
});

test('equal candidates are ambiguous and duplicate discoveries are reported', async () => {
  const data = seed(); data.Unmanaged.push({ id: 1, name: 'host', ip: '192.0.2.30' }, { id: 2, name: 'host', ip: '192.0.2.30' });
  data.Computer.push({ id: 10, name: 'host', ip: '192.0.2.30' }, { id: 11, name: 'host', ip: '192.0.2.30' });
  const result: any = await new LegacyUnmanagedReconciliationService(mockClient(data).client).audit(request());
  assert.ok(result.results.every((row: any) => row.verdict === 'duplicate_unmanaged'));
  data.Unmanaged.splice(1); const ambiguous: any = await new LegacyUnmanagedReconciliationService(mockClient(data).client).audit(request());
  assert.equal(ambiguous.results[0].verdict, 'ambiguous');
});

test('blacklisted MAC and weak names do not create strong identity', async () => {
  const data = seed(); data.Unmanaged.push({ id: 1, name: 'Hub', mac: '00:00:00:00:00:00' });
  const result: any = await new LegacyUnmanagedReconciliationService(mockClient(data).client).audit(request());
  assert.equal(result.results[0].verdict, 'weak_discovery'); assert.deepEqual(result.results[0].unmanaged.macs, []);
});

test('entity filtering and pagination report incomplete analysis', async () => {
  const data = seed(); data.Unmanaged.push({ id: 1, name: 'a', entities_id: 2 }, { id: 2, name: 'b', entities_id: 3 }, { id: 3, name: 'c', entities_id: 2 });
  const result: any = await new LegacyUnmanagedReconciliationService(mockClient(data).client).audit(request({ entityId: 2, limit: 1 }));
  assert.equal(result.summary.unmanaged_scanned, 2); assert.equal(result.results.length, 1); assert.equal(result.pagination.incomplete, true);
});

test('apply is write-free and reports not_supported even after valid confirmation', async () => {
  const mock = mockClient(seed()); const result: any = await new LegacyUnmanagedReconciliationService(mock.client).apply({
    actions: [{ unmanagedId: 1, action: 'manual_review' }], dryRun: false,
    confirmation: 'I_HAVE_VERIFIED_THE_UNMANAGED_RECONCILIATION',
  });
  assert.equal(result.status, 'not_supported'); assert.equal(mock.writes(), 0);
});

test('Zod and MCP annotations enforce bounded, guarded behavior', () => {
  assert.throws(() => unmanagedAuditSchema.parse({ unmanaged_ids: [] }));
  assert.throws(() => unmanagedApplySchema.parse({ actions: [{ unmanaged_id: 1, action: 'manual_review' }], dry_run: false }));
  assert.equal(toolAnnotations('glpi_audit_unmanaged_assets').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_apply_unmanaged_asset_reconciliation').destructiveHint, true);
});

test('High-Level reconciliation fails explicitly instead of guessing routes', async () => {
  await assert.rejects(() => new HighLevelUnmanagedReconciliationService().audit(request()), /not supported/i);
});
