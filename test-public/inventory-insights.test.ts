import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyInventoryInsightsService } from '../src/api/legacy/inventory-insights.js';
import { fortigateAuditSchema, taskReprepareSchema } from '../src/core/inventory-insights/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

function fixture(seed: Record<string, any[]>) {
  const writes: Array<{ itemtype: string; id: number; payload: Record<string, unknown> }> = [];
  return { writes, client: {
    async getItems(itemtype: string) { return (seed[itemtype] ?? []).map((row) => structuredClone(row)); },
    async getItem(itemtype: string, id: number) { const row = (seed[itemtype] ?? []).find((entry) => entry.id === id); if (!row) throw new Error('not found'); return structuredClone(row); },
    async updateItem(itemtype: string, id: number, payload: Record<string, unknown>) {
      writes.push({ itemtype, id, payload }); const row = (seed[itemtype] ?? []).find((entry) => entry.id === id); Object.assign(row, payload);
    },
  } as any };
}

test('FortiGate HA audit never merges distinct serials sharing virtual IP and MAC', async () => {
  const data = { NetworkEquipment: [
    { id: 1, name: 'FG-CLUSTER MASTER', serial: 'FG-A', ip: '10.0.0.1', mac: '00:00:5e:00:01:01' },
    { id: 2, name: 'FG-CLUSTER SLAVE', serial: 'FG-B', ip: '10.0.0.1', mac: '00:00:5e:00:01:01' },
  ], Unmanaged: [] };
  const result: any = await new LegacyInventoryInsightsService(fixture(data).client).auditFortigateHA(fortigateAuditSchema.parse({}));
  assert.equal(result.findings[0].classification, 'same_cluster_distinct_members');
  assert.equal(result.findings[0].must_not_merge_members, true);
  assert.ok(result.findings[0].warnings.includes('shared_virtual_or_reserved_mac'));
});

test('classification recognizes FortiAP fragments, IP-only discoveries and OUI-only names', async () => {
  const data = { Unmanaged: [
    { id: 1, name: 'internal1', sysdescr: 'FortiAP wireless access point', mac: 'aa:bb:cc:dd:ee:ff' },
    { id: 2, name: '10.0.0.8', ip: '10.0.0.8' },
    { id: 3, name: 'Mitel Corporation', mac: '00:11:22:33:44:55' },
  ] };
  const result: any = await new LegacyInventoryInsightsService(fixture(data).client).classifyDiscovery({ start: 0, limit: 100, include_evidence: true });
  assert.deepEqual(result.results.map((row: any) => row.category), ['fortiap', 'ip_only', 'oui_only']);
  assert.equal(result.results[2].oui_is_inference_only, true);
});

test('task reprepare uses expected state and verifies, while prepare-once disables repetition', async () => {
  const data = { PluginGlpiinventoryTask: [{ id: 9, is_active: 0, reprepare_if_successful: 0 }] };
  const mock = fixture(data); const service = new LegacyInventoryInsightsService(mock.client);
  const changed: any = await service.setTaskReprepare(taskReprepareSchema.parse({ task_id: 9, enabled: true, expected_current_state: false, confirmation: 'I_HAVE_VERIFIED_THE_INVENTORY_TASK' }));
  assert.equal(changed.verification_status, 'verified');
  const once: any = await service.prepareTaskOnce({ task_id: 9, confirmation: 'I_HAVE_VERIFIED_THE_INVENTORY_TASK' });
  assert.equal(once.repeat_enabled, false); assert.equal(mock.writes.length, 2);
});

test('provenance redacts inventory secrets and exposes unavailable facts explicitly', async () => {
  const data = { NetworkEquipment: [{ id: 4, name: 'switch', date_creation: '2026-01-01' }], Log: [],
    PluginGlpiinventoryTaskjobstate: [{ id: 8, items_id: 4, community: 'private', auth_key: 'secret', agents_id: 2 }] };
  const result: any = await new LegacyInventoryInsightsService(fixture(data).client).getProvenance({ itemtype: 'NetworkEquipment', asset_id: 4 });
  assert.equal(result.creation_source, 'unavailable');
  assert.equal(result.task_job_evidence[0].community, '[REDACTED]');
  assert.equal(result.task_job_evidence[0].auth_key, '[REDACTED]');
});

test('P1/P2 schemas and annotations distinguish reads from confirmed task writes', () => {
  assert.throws(() => taskReprepareSchema.parse({ task_id: 1, enabled: true, expected_current_state: false, confirmation: 'NO' }));
  assert.equal(toolAnnotations('glpi_audit_fortigate_ha_assets').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_inventory_preview_task_schedule').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_inventory_set_task_reprepare').readOnlyHint, false);
});

test('asset network identity joins ports, names, IP addresses and VLANs without weak inference', async () => {
  const data = { NetworkEquipment: [{ id: 4, name: 'switch' }],
    NetworkPort: [{ id: 10, itemtype: 'NetworkEquipment', items_id: 4, name: 'port1', mac: '00:11:22:33:44:55' }],
    NetworkName: [{ id: 20, itemtype: 'NetworkPort', items_id: 10, name: 'switch.example' }],
    IPAddress: [{ id: 30, itemtype: 'NetworkName', items_id: 20, mainitemtype: 'NetworkEquipment', mainitems_id: 4, name: '192.0.2.4' }],
    NetworkPort_Vlan: [{ id: 40, networkports_id: 10, vlans_id: 5, tagged: 1 }] };
  const result: any = await new LegacyInventoryInsightsService(fixture(data).client).getAssetNetworkIdentity({ itemtype: 'NetworkEquipment', asset_id: 4, include_raw: false });
  assert.equal(result.ports[0].mac_classification, 'physical_candidate');
  assert.equal(result.ip_addresses[0].address, '192.0.2.4');
  assert.equal(result.vlan_links[0].vlan_id, 5);
});
