import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacySiteNetworkProvisioningService } from '../src/api/legacy/site-network-provisioning.js';
import { HighLevelSiteNetworkProvisioningService } from '../src/api/highlevel/site-network-provisioning.js';
import { siteNetworkProvisioningApplySchema, siteNetworkProvisioningSchema } from '../src/core/site-network-provisioning/schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

const request = {
  entity_id: 101, parent_location_id: 201, location_name: 'Example Wireless Lab', network_name: 'Example Wireless Lab : 192.0.2.0/24',
  cidr: '192.0.2.0/24', gateway: '192.0.2.254', is_recursive: false, addressable: true,
  discovery_task_id: 301, discovery_job_id: 302, inventory_task_id: 303, inventory_job_id: 304,
  source_inventory_range_id: 401, copy_snmp_credentials: true, copy_addressing_options: false, addressing_options: { use_ping: false, alloted_ip: true },
  rule_name: 'Example Wireless Lab – Subnet', rule_scope_entity_id: 0, rule_match: 'OR' as const, activate_rule: false,
};

function fixture() {
  const target = '[{"PluginGlpiinventoryIPRange":"701"}]'; let mutatedTarget = target; const writes: unknown[] = [];
  const rows: Record<string, Record<string, unknown>[]> = {
    Location: [{ id: 201, name: 'Example Parent', entities_id: 101 }, { id: 501, name: request.location_name, locations_id: 201, entities_id: 101 }],
    IPNetwork: [{ id: 601, name: request.network_name, network: request.cidr, gateway: request.gateway, entities_id: 101, addressable: 1 }],
    PluginGlpiinventoryIPRange: [{ id: 401, name: 'example source', ip_start: '198.51.100.1', ip_end: '198.51.100.254', entities_id: 101 }, { id: 701, name: request.network_name, ip_start: '192.0.2.1', ip_end: '192.0.2.254', entities_id: 101 }],
    RuleImportEntity: [{ id: 801, name: request.rule_name, is_active: 0, ranking: 10, entities_id: 0 }],
  };
  const items: Record<string, Record<string, unknown>> = {
    Entity: { id: 101, name: 'Example Entity' },
    'Location:201': rows.Location[0], 'PluginGlpiinventoryIPRange:401': rows.PluginGlpiinventoryIPRange[0], 'PluginGlpiinventoryIPRange:701': rows.PluginGlpiinventoryIPRange[1],
    'PluginGlpiinventoryTask:301': { id: 301 }, 'PluginGlpiinventoryTask:303': { id: 303 },
    'PluginGlpiinventoryTaskjob:302': { id: 302, plugin_glpiinventory_tasks_id: 301, method: 'networkdiscovery', targets: target },
    'PluginGlpiinventoryTaskjob:304': { id: 304, plugin_glpiinventory_tasks_id: 303, method: 'networkinventory', targets: target },
  };
  const client = {
    async getItems(type: string) { return structuredClone(rows[type] ?? []); },
    async getItem(type: string, id: number) {
      if (type === 'PluginGlpiinventoryTaskjob') return { ...items[`${type}:${id}`], targets: mutatedTarget };
      if (type === 'SNMPCredential') return { id, name: `credential-${id}` };
      const value = items[`${type}:${id}`] ?? (type === 'Entity' ? items.Entity : rows[type]?.find((row) => row.id === id));
      if (!value) throw new Error(`missing ${type}:${id}`); return structuredClone(value);
    },
    async updateItem(type: string, id: number, payload: any) { writes.push(['update', type, id, payload]); if (type === 'PluginGlpiinventoryTaskjob') mutatedTarget = payload.targets; },
  } as any;
  const service = new LegacySiteNetworkProvisioningService(client); const relations = [1, 2, 3, 4].map((id, rank) => ({ snmpcredentials_id: id, rank }));
  (service as any).inventory.listIPRangeSNMPCredentials = async ({ ip_range_id, snmp_credential_id }: any) => ip_range_id === 401 ? relations : relations.filter((row) => !snmp_credential_id || row.snmpcredentials_id === snmp_credential_id);
  (service as any).rules.get = async () => ({ id: 801, name: request.rule_name, match: 'OR', is_active: 0, criteria: [{ criteria: 'subnet', condition: 333, pattern: request.cidr }, { criteria: 'ip', condition: 333, pattern: request.cidr }], actions: [{ field: 'entities_id', value: '101' }, { field: 'locations_id', value: '501' }] });
  (service as any).addressing.preview = async () => ({ fingerprint: 'a'.repeat(64), items: [{ action: 'unchanged', warnings: [] }] });
  (service as any).addressing.apply = async () => ({ results: [{ action: 'unchanged', range_id: 49 }] });
  return { service, writes, rows, mutate: () => { mutatedTarget = '[{"Computer":"99"}]'; } };
}

test('acceptance preview covers the full chain and apply replay creates no duplicate', async () => {
  const f = fixture(); const preview: any = await f.service.preview(request);
  assert.equal(preview.applicable, true); assert.equal(preview.steps.length, 13); assert.equal(preview.modifies_data, false);
  assert.equal(preview.steps.find((row: any) => row.key === 'snmp_credentials').evidence.associations.length, 4);
  assert.doesNotMatch(JSON.stringify(preview), /password|community|secret/i);
  const result: any = await f.service.apply({ ...request, preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_SITE_NETWORK_PLAN' });
  assert.equal(result.success, true); assert.equal(result.task_execution_triggered, false);
  assert.equal(f.writes.length, 0, 'fully satisfied replay must perform no GLPI update or create');
});

test('mutation after preview is rejected before any write', async () => {
  const f = fixture(); const preview: any = await f.service.preview(request); f.mutate();
  await assert.rejects(() => f.service.apply({ ...request, preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_SITE_NETWORK_PLAN' }), /stale/);
  assert.equal(f.writes.length, 0);
});

test('a late failure reports retained ids and a fresh preview resumes safely', async () => {
  const f = fixture();
  const originalApply = (f.service as any).addressing.apply;
  (f.service as any).addressing.apply = async () => { throw new Error('simulated Addressing interruption'); };
  const firstPreview: any = await f.service.preview(request);
  const interrupted: any = await f.service.apply({ ...request, preview_fingerprint: firstPreview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_SITE_NETWORK_PLAN' });
  assert.equal(interrupted.success, false);
  assert.deepEqual(interrupted.ids, { location_id: 501, ip_network_id: 601, inventory_range_id: 701, rule_id: 801 });
  assert.equal(interrupted.automatic_rollback, false);
  assert.match(interrupted.failure.message, /simulated Addressing interruption/);

  (f.service as any).addressing.apply = originalApply;
  const resumedPreview: any = await f.service.preview(request);
  const resumed: any = await f.service.apply({ ...request, preview_fingerprint: resumedPreview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_SITE_NETWORK_PLAN' });
  assert.equal(resumed.success, true);
  assert.equal(resumed.task_execution_triggered, false);
});

test('workflow schemas and annotations enforce confirmations and explicit activation', () => {
  assert.doesNotThrow(() => siteNetworkProvisioningSchema.parse(request));
  assert.throws(() => siteNetworkProvisioningSchema.parse({ ...request, activate_rule: true }));
  assert.throws(() => siteNetworkProvisioningApplySchema.parse(request));
  assert.equal(toolAnnotations('glpi_preview_site_network_provisioning').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_apply_site_network_provisioning').idempotentHint, true);
});

test('duplicate locations fail closed and High-Level never guesses routes', async () => {
  const f = fixture();
  f.rows.Location.push({ id: 556, name: request.location_name, locations_id: request.parent_location_id, entities_id: request.entity_id });
  const preview: any = await f.service.preview(request);
  assert.equal(preview.applicable, false);
  assert.ok(preview.conflicts.includes('location'));
  await assert.rejects(() => new HighLevelSiteNetworkProvisioningService().preview(request), /Not supported.*highlevel/);
});
