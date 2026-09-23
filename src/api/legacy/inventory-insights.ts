import { InventoryInsightsService } from '../../core/inventory-insights/service.js';
import { GlpiClient } from './glpi-client.js';
import { classifyMac, normalizeHost, normalizeIp, normalizeMac } from './unmanaged-reconciliation.js';

const SECRET = /community|password|passwd|secret|auth(?:entication)?_?key|privacy_?key|encryption_?key|token|authorization|cookie/i;
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, SECRET.test(key) ? '[REDACTED]' : sanitize(child)]));
}
function n(value: unknown): number { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : 0; }
function s(value: unknown): string { return String(value ?? '').trim(); }
function bool(value: unknown): boolean { return value === true || value === 1 || value === '1'; }
function collect(item: unknown, matcher: RegExp, normalize: (value: unknown) => string | null): string[] {
  const result = new Set<string>();
  const visit = (value: unknown, key = ''): void => {
    if (Array.isArray(value)) value.forEach((entry) => visit(entry, key));
    else if (value && typeof value === 'object') Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
    else if (matcher.test(key)) { const normalized = normalize(value); if (normalized) result.add(normalized); }
  };
  visit(item); return [...result];
}
function serial(value: unknown): string | null {
  const normalized = s(value).toLowerCase().replace(/\s+/g, '');
  return normalized && !/^(0+|unknown|none|n\/a|tobefilled)$/i.test(normalized) ? normalized : null;
}
function identity(row: Record<string, unknown>) {
  const macs = collect(row, /(^|_)(mac|mac_address|macaddress)(s)?$/i, normalizeMac).map((mac) => ({ value: mac, classification: classifyMac(mac) }));
  return { id: n(row.id), name: normalizeHost(row.name ?? row.hostname), serial: serial(row.serial),
    ips: collect(row, /(^|_)(ip|ip_address|ipaddress|address)(es)?$/i, normalizeIp), macs,
    entity_id: n(row.entities_id), sysdescr: s(row.sysdescr ?? row.sysDescr), raw: row };
}
function related(row: Record<string, unknown>, field: string, id: number): boolean {
  return n(row[field]) === id || Object.values(row).some((value) => typeof value === 'string' && new RegExp(`/${id}(?:$|\\?)`).test(value));
}
function dateOf(row: Record<string, unknown>): string { return s(row.date_mod ?? row.date ?? row.date_creation ?? row.begin_date); }

export class LegacyInventoryInsightsService implements InventoryInsightsService {
  constructor(private readonly client: GlpiClient) {}
  private all(itemtype: string, limit = 50000): Promise<Record<string, unknown>[]> {
    return this.client.getItems<Record<string, unknown>>(itemtype, { range: `0-${limit - 1}`, expand_dropdowns: false });
  }

  async auditFortigateHA(input: Record<string, unknown>): Promise<unknown> {
    const [managedRows, unmanagedRows] = await Promise.all([this.all('NetworkEquipment'), this.all('Unmanaged')]);
    const entityId = input.entity_id === undefined ? undefined : n(input.entity_id);
    const managedIds = new Set((input.network_equipment_ids as number[] | undefined) ?? []);
    const unmanagedIds = new Set((input.unmanaged_ids as number[] | undefined) ?? []);
    const rows = [
      ...managedRows.filter((row) => (!managedIds.size || managedIds.has(n(row.id))) && (entityId === undefined || n(row.entities_id) === entityId)).map((row) => ({ source: 'managed', ...identity(row) })),
      ...unmanagedRows.filter((row) => (!unmanagedIds.size || unmanagedIds.has(n(row.id))) && (entityId === undefined || n(row.entities_id) === entityId)).map((row) => ({ source: 'unmanaged', ...identity(row) })),
    ].filter((row) => /forti|fortigate|fortios|master|slave|primary|secondary/i.test(`${row.name} ${row.sysdescr}`));
    const virtualPrefixes = ((input.virtual_mac_prefixes as string[] | undefined) ?? []).map((prefix) => prefix.toLowerCase().replace(/[^0-9a-f]/g, ''));
    const findings: Record<string, unknown>[] = [];
    for (let index = 0; index < rows.length; index++) for (let otherIndex = index + 1; otherIndex < rows.length; otherIndex++) {
      const left = rows[index]; const right = rows[otherIndex];
      const sharedIps = left.ips.filter((ip) => right.ips.includes(ip));
      const sharedMacs = left.macs.filter((mac) => right.macs.some((candidate) => candidate.value === mac.value));
      const distinctSerials = Boolean(left.serial && right.serial && left.serial !== right.serial);
      const sharedClusterName = normalizeHost(left.name.replace(/(?:master|slave|primary|secondary)/gi, '')) === normalizeHost(right.name.replace(/(?:master|slave|primary|secondary)/gi, ''));
      const clusterMatch = input.cluster_identity === 'shared_ip' ? sharedIps.length > 0 : input.cluster_identity === 'shared_mac' ? sharedMacs.length > 0 : sharedClusterName;
      if (!clusterMatch) continue;
      findings.push({ members: [{ source: left.source, id: left.id, name: left.name, serial: left.serial }, { source: right.source, id: right.id, name: right.name, serial: right.serial }],
        shared_ips: sharedIps, shared_macs: sharedMacs, distinct_physical_serials: distinctSerials,
        classification: distinctSerials && (sharedIps.length || sharedMacs.length) ? 'same_cluster_distinct_members' : distinctSerials ? 'distinct_members' : 'ambiguous',
        must_not_merge_members: distinctSerials,
        warnings: [sharedMacs.some((mac) => mac.classification !== 'physical_candidate' || virtualPrefixes.some((prefix) => mac.value.startsWith(prefix))) ? 'shared_virtual_or_reserved_mac' : '', distinctSerials ? 'serial_is_member_identity' : 'missing_distinct_serial_evidence'].filter(Boolean),
        recommended_action: distinctSerials ? 'keep_members_separate_and_link_cluster_context_only' : 'manual_review' });
    }
    return { policy: { cluster_identity: input.cluster_identity, member_identity: 'serial', allow_shared_mac_for_member_linking: input.allow_shared_mac_for_member_linking }, assets_scanned: rows.length, findings, modifies_data: false };
  }

  async getProvenance(input: Record<string, unknown>): Promise<unknown> {
    const itemtype = s(input.itemtype); const assetId = n(input.asset_id);
    const [asset, logs, states] = await Promise.all([this.client.getItem<Record<string, unknown>>(itemtype, assetId, { expand_dropdowns: false }), this.all('Log'), this.all('PluginGlpiinventoryTaskjobstate')]);
    const relevantLogs = logs.filter((row) => related(row, 'items_id', assetId) && (!row.itemtype || s(row.itemtype) === itemtype));
    const relevantStates = states.filter((row) => related(row, 'items_id', assetId) || related(row, 'item_id', assetId));
    return { asset: { itemtype, id: assetId, name: asset.name, date_creation: asset.date_creation ?? null, date_mod: asset.date_mod ?? null },
      creation_source: relevantLogs.length ? 'inferred_from_glpi_log' : 'unavailable', winning_import_rule: 'unavailable_unless_present_in_log',
      inventory_agent: relevantStates.length ? relevantStates.map((row) => row.plugin_glpiinventory_agents_id ?? row.agents_id).filter(Boolean) : 'unavailable',
      task_job_evidence: sanitize(relevantStates), scanned_ip: relevantStates.map((row) => row.ip ?? row.ip_address).filter(Boolean),
      credential: relevantStates.map((row) => ({ id: row.snmpcredentials_id ?? row.credentials_id ?? null, secret: '[REDACTED]' })).filter((row) => row.id),
      payload_checksum: 'unavailable', field_changes: sanitize(relevantLogs), limitations: ['GLPI REST does not guarantee persistence of the winning rule or raw payload checksum'], modifies_data: false };
  }

  async getTimeline(input: Record<string, unknown>): Promise<unknown> {
    const provenance = await this.getProvenance(input) as Record<string, unknown>;
    const logs = Array.isArray(provenance.field_changes) ? provenance.field_changes as Record<string, unknown>[] : [];
    const jobs = Array.isArray(provenance.task_job_evidence) ? provenance.task_job_evidence as Record<string, unknown>[] : [];
    const events = [...logs.map((row) => ({ at: dateOf(row), event: 'glpi_asset_change', actor: row.users_id ?? row.user_name ?? null, details: row })),
      ...jobs.map((row) => ({ at: dateOf(row), event: 'inventory_task_state', actor: row.plugin_glpiinventory_agents_id ?? null, details: row }))].sort((a, b) => a.at.localeCompare(b.at));
    return { asset: provenance.asset, events, unavailable_events_are_not_invented: true, modifies_data: false };
  }

  async getRawPayload(input: Record<string, unknown>): Promise<unknown> {
    return { status: 'not_supported', itemtype: input.itemtype, asset_id: input.asset_id,
      explanation: 'No source-audited GLPI 11 REST itemtype for the original network inventory payload has been confirmed. No guessed endpoint was called.',
      mandatory_redaction: ['SNMP communities', 'passwords', 'authentication/encryption keys', 'tokens', 'Authorization headers'], modifies_data: false };
  }

  async previewTaskSchedule(input: Record<string, unknown>): Promise<unknown> {
    const taskId = n(input.task_id); const task = await this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTask', taskId, { expand_dropdowns: false });
    const [jobs, states] = await Promise.all([this.all('PluginGlpiinventoryTaskjob'), this.all('PluginGlpiinventoryTaskjobstate')]);
    const taskJobs = jobs.filter((row) => related(row, 'plugin_glpiinventory_tasks_id', taskId));
    const jobIds = new Set(taskJobs.map((row) => n(row.id)));
    const taskStates = states.filter((row) => jobIds.has(n(row.plugin_glpiinventory_taskjobs_id)));
    const latest = [...taskStates].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];
    return { task_id: taskId, active: bool(task.is_active), reprepare_if_successful: bool(task.reprepare_if_successful),
      window: { start: task.datetime_start ?? null, end: task.datetime_end ?? null, timeslot_id: task.plugin_glpiinventory_timeslots_id ?? null },
      actor: task.users_id ?? null, last_preparation: task.date_mod ?? null, last_execution: latest ? dateOf(latest) : null,
      next_execution_probable: bool(task.is_active) ? 'scheduler_or_agent_poll_dependent' : null,
      trigger: task.execution_id ?? task.method ?? 'server_wakeup_or_agent_polling_not_exposed', jobs: sanitize(taskJobs), modifies_data: false };
  }

  async setTaskReprepare(input: Record<string, unknown>): Promise<unknown> {
    const taskId = n(input.task_id); const before = await this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTask', taskId, { expand_dropdowns: false });
    const current = bool(before.reprepare_if_successful); if (current !== input.expected_current_state) throw new Error('Task changed since expected_current_state was chosen');
    if (current !== input.enabled) await this.client.updateItem('PluginGlpiinventoryTask', taskId, { reprepare_if_successful: input.enabled ? 1 : 0 });
    const after = await this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTask', taskId, { expand_dropdowns: false });
    if (bool(after.reprepare_if_successful) !== input.enabled) throw new Error('Post-write verification failed for reprepare_if_successful');
    return { success: true, task_id: taskId, before: current, after: bool(after.reprepare_if_successful), verification_status: 'verified' };
  }

  async prepareTaskOnce(input: Record<string, unknown>): Promise<unknown> {
    const taskId = n(input.task_id); const before = await this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTask', taskId, { expand_dropdowns: false });
    await this.client.updateItem('PluginGlpiinventoryTask', taskId, { reprepare_if_successful: 0, is_active: 1 });
    const after = await this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTask', taskId, { expand_dropdowns: false });
    if (bool(after.reprepare_if_successful) || !bool(after.is_active)) throw new Error('Post-write verification failed while preparing one execution');
    return { success: true, task_id: taskId, before: sanitize(before), after: sanitize(after), repeat_enabled: false, status: 'prepared_for_scheduler', verification_status: 'verified' };
  }

  async getTaskExecutionTimeline(input: Record<string, unknown>): Promise<unknown> {
    const [jobs, states] = await Promise.all([this.all('PluginGlpiinventoryTaskjob'), this.all('PluginGlpiinventoryTaskjobstate')]);
    const taskId = input.task_id === undefined ? undefined : n(input.task_id); const jobId = input.job_id === undefined ? undefined : n(input.job_id);
    const allowedJobs = new Set(jobs.filter((row) => taskId === undefined || related(row, 'plugin_glpiinventory_tasks_id', taskId)).map((row) => n(row.id)));
    const filtered = states.filter((row) => (jobId === undefined ? allowedJobs.has(n(row.plugin_glpiinventory_taskjobs_id)) : n(row.plugin_glpiinventory_taskjobs_id) === jobId) &&
      (input.agent_id === undefined || n(row.plugin_glpiinventory_agents_id ?? row.agents_id) === n(input.agent_id)) &&
      (input.state === undefined || s(row.state) === s(input.state)) && (input.date_from === undefined || dateOf(row) >= s(input.date_from)) && (input.date_to === undefined || dateOf(row) <= s(input.date_to)))
      .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const start = n(input.start); const limit = n(input.limit) || 100;
    return { events: sanitize(filtered.slice(start, start + limit)), pagination: { start, returned: Math.min(limit, Math.max(0, filtered.length - start)), total: filtered.length },
      timezones: { utc: 'dates returned as stored by GLPI; UTC conversion unavailable without confirmed GLPI timezone', glpi: 'unavailable_from_this_endpoint' }, modifies_data: false };
  }

  async classifyDiscovery(input: Record<string, unknown>): Promise<unknown> {
    const rows = await this.all('Unmanaged'); const ids = new Set((input.unmanaged_ids as number[] | undefined) ?? []); const entityId = input.entity_id === undefined ? undefined : n(input.entity_id);
    const classified = rows.filter((row) => (!ids.size || ids.has(n(row.id))) && (entityId === undefined || n(row.entities_id) === entityId)).map((row) => {
      const item = identity(row); const corpus = `${item.name} ${item.sysdescr} ${s(row.sysobjectid ?? row.sysObjectID)}`.toLowerCase();
      const evidence: string[] = []; let category = 'unknown';
      if (/corporation|\binc\.?$|technologies|communications/.test(item.name) && !item.sysdescr) { category = 'oui_only'; evidence.push('vendor-like name without SysDescr'); }
      else if (/fortigate|fortios/.test(corpus) && /(master|slave|primary|secondary|cluster|ha)/.test(corpus)) { category = 'fortigate_ha'; evidence.push('FortiGate/HA tokens'); }
      else if (/fortiap/.test(corpus)) { category = 'fortiap'; evidence.push('FortiAP token'); }
      else if (/fortiswitch/.test(corpus)) { category = 'fortiswitch'; evidence.push('FortiSwitch token'); }
      else if (/printer|ricoh|brother|intermec|laserjet/.test(corpus) || row.printermodels_id) { category = 'printer_candidate'; evidence.push('printer SysDescr/model token'); }
      else if (/phone|sip|mitel/.test(corpus)) { category = 'phone_candidate'; evidence.push('phone/SIP vendor token'); }
      else if (/switch|router|firewall|network|forti|cisco|aruba/.test(corpus)) { category = 'network_equipment_candidate'; evidence.push('network SysDescr/vendor token'); }
      else if (/windows|linux|computer|workstation|server/.test(corpus)) { category = 'computer_candidate'; evidence.push('computer OS/SysDescr token'); }
      else if (item.name === 'internal1') { category = 'interface_fragment'; evidence.push('generic interface name'); }
      else if (/^(hub|switch|router|printer)$/.test(item.name)) { category = 'generic_hub'; evidence.push('generic name'); }
      else if (item.ips.length && !item.macs.length) { category = 'ip_only'; evidence.push('IP without MAC'); }
      else if (item.macs.length && !item.ips.length) { category = 'mac_only'; evidence.push('MAC without IP'); }
      return { unmanaged_id: item.id, name: item.name, category, confidence: evidence.length ? 'medium' : 'low', evidence: input.include_evidence === false ? undefined : evidence, oui_is_inference_only: category === 'oui_only' };
    });
    const start = n(input.start); const limit = n(input.limit) || 100;
    return { summary: classified.reduce((counts: Record<string, number>, row) => ({ ...counts, [row.category]: (counts[row.category] ?? 0) + 1 }), {}), results: classified.slice(start, start + limit), pagination: { start, total: classified.length }, modifies_data: false };
  }

  async getAssetNetworkIdentity(input: Record<string, unknown>): Promise<unknown> {
    const itemtype = s(input.itemtype); const assetId = n(input.asset_id);
    const [asset, portsAll, namesAll, addressesAll, vlansAll] = await Promise.all([
      this.client.getItem<Record<string, unknown>>(itemtype, assetId, { expand_dropdowns: false }), this.all('NetworkPort'),
      this.all('NetworkName'), this.all('IPAddress'), this.all('NetworkPort_Vlan'),
    ]);
    const ports = portsAll.filter((row) => s(row.itemtype) === itemtype && n(row.items_id) === assetId);
    const portIds = new Set(ports.map((row) => n(row.id)));
    const names = namesAll.filter((row) => (s(row.itemtype) === 'NetworkPort' && portIds.has(n(row.items_id))) || (s(row.itemtype) === itemtype && n(row.items_id) === assetId));
    const nameIds = new Set(names.map((row) => n(row.id)));
    const addresses = addressesAll.filter((row) => (s(row.mainitemtype) === itemtype && n(row.mainitems_id) === assetId) || (s(row.itemtype) === 'NetworkName' && nameIds.has(n(row.items_id))));
    const vlanLinks = vlansAll.filter((row) => portIds.has(n(row.networkports_id)));
    return { asset: { itemtype, id: assetId, name: asset.name },
      ports: ports.map((row) => ({ id: n(row.id), name: row.name ?? null, logical_number: row.logical_number ?? null, mac: normalizeMac(row.mac), mac_classification: classifyMac(row.mac), type: row.instantiation_type ?? row.itemtype_port ?? null, raw: input.include_raw ? sanitize(row) : undefined })),
      network_names: names.map((row) => ({ id: n(row.id), name: row.name ?? null, fqdn_id: row.fqdns_id ?? null, raw: input.include_raw ? sanitize(row) : undefined })),
      ip_addresses: addresses.map((row) => ({ id: n(row.id), address: row.name ?? row.address ?? null, version: row.version ?? null, raw: input.include_raw ? sanitize(row) : undefined })),
      vlan_links: vlanLinks.map((row) => ({ id: n(row.id), network_port_id: n(row.networkports_id), vlan_id: n(row.vlans_id), tagged: row.tagged ?? null, raw: input.include_raw ? sanitize(row) : undefined })),
      completeness: { complete: portsAll.length < 50000 && namesAll.length < 50000 && addressesAll.length < 50000 && vlansAll.length < 50000, safety_cap: 50000 }, modifies_data: false };
  }
}
