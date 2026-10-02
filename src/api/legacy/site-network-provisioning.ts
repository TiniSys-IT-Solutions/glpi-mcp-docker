import { createHash } from 'node:crypto';
import { SiteNetworkProvisioningService } from '../../core/site-network-provisioning/service.js';
import { ProvisioningStep, SiteNetworkProvisioningApplyRequest, SiteNetworkProvisioningRequest } from '../../core/site-network-provisioning/types.js';
import { cidrToIPRange, LegacyInventoryPluginService, normalizeTaskJobTargets } from './inventory-plugin.js';
import { LegacyAddressingSyncService, normalizeLegacyIPNetwork } from './addressing-sync.js';
import { LegacyImportEntityRuleService } from './rules.js';
import { LegacyIPNetworkService } from './ip-networks.js';
import { LegacyOrganizationService } from './organization.js';
import { GlpiClient } from './glpi-client.js';

const IP_RANGE_TARGET = 'PluginGlpiinventoryIPRange';
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function n(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown): string { return String(value ?? '').trim(); }
function bool(value: unknown): boolean { return value === true || value === 1 || value === '1'; }
function ipv4(value: string): number { return value.split('.').reduce((out, part) => out * 256 + Number(part), 0); }
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean { return ipv4(aStart) <= ipv4(bEnd) && ipv4(bStart) <= ipv4(aEnd); }
function relation(row: Record<string, unknown>, field: string): number { const value = row[field]; if (typeof value === 'number') return value; if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value); return 0; }
function step(key: string, status: ProvisioningStep['status'], evidence: Record<string, unknown>, proposed_action: Record<string, unknown> | null, dependencies: string[] = [], warnings: string[] = [], ambiguous = false, reversible = true): ProvisioningStep {
  return { key, status, evidence, proposed_action, warnings, reversible, dependencies, ambiguous };
}
function idOf(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const row = value as Record<string, unknown>; return n(row.id ?? (row.rule as Record<string, unknown> | undefined)?.id);
}

export class LegacySiteNetworkProvisioningService implements SiteNetworkProvisioningService {
  private readonly inventory: LegacyInventoryPluginService;
  private readonly addressing: LegacyAddressingSyncService;
  private readonly rules: LegacyImportEntityRuleService;
  private readonly networks: LegacyIPNetworkService;
  private readonly organization: LegacyOrganizationService;
  constructor(private readonly client: GlpiClient) {
    this.inventory = new LegacyInventoryPluginService(client); this.addressing = new LegacyAddressingSyncService(client);
    this.rules = new LegacyImportEntityRuleService(client); this.networks = new LegacyIPNetworkService(client); this.organization = new LegacyOrganizationService(client);
  }
  private async all(itemtype: string, cap = 10000): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let start = 0; start < cap; start += 1000) {
      const page = await this.client.getItems<Record<string, unknown>>(itemtype, { range: `${start}-${Math.min(cap, start + 1000) - 1}`, expand_dropdowns: false });
      out.push(...page); if (page.length < 1000) return out;
    }
    throw new Error(`Safety cap reached while resolving ${itemtype}`);
  }
  private async effectiveAddressingOptions(input: SiteNetworkProvisioningRequest) {
    if (!input.copy_addressing_options || !input.source_addressing_range_id) return input.addressing_options;
    const source = await this.addressing.get(input.source_addressing_range_id) as Record<string, unknown>;
    if (n(source.entity_id) !== input.entity_id) throw new Error('Source Addressing range belongs to another entity');
    const copied = Object.fromEntries(['use_as_filter', 'alloted_ip', 'double_ip', 'free_ip', 'reserved_ip'].map((key) => [key, bool(source[key])]));
    return { ...copied, ...input.addressing_options, use_ping: input.addressing_options.use_ping };
  }
  async preview(input: SiteNetworkProvisioningRequest): Promise<unknown> {
    const usable = cidrToIPRange(input.cidr, true); const full = cidrToIPRange(input.cidr, false);
    if (ipv4(input.gateway) < ipv4(full.ip_start) || ipv4(input.gateway) > ipv4(full.ip_end)) throw new Error('Gateway is outside the requested CIDR');
    const [entity, parent, locations, rawNetworks, ranges, rules, discoveryTask, discoveryJob, inventoryTask, inventoryJob] = await Promise.all([
      this.client.getItem<Record<string, unknown>>('Entity', input.entity_id, { expand_dropdowns: false }),
      this.client.getItem<Record<string, unknown>>('Location', input.parent_location_id, { expand_dropdowns: false }), this.all('Location'), this.all('IPNetwork'),
      this.all('PluginGlpiinventoryIPRange'), this.all('RuleImportEntity', 5000),
      this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTask', input.discovery_task_id, { expand_dropdowns: false }),
      this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTaskjob', input.discovery_job_id, { expand_dropdowns: false }),
      this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTask', input.inventory_task_id, { expand_dropdowns: false }),
      this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryTaskjob', input.inventory_job_id, { expand_dropdowns: false }),
    ]);
    const steps: ProvisioningStep[] = [];
    steps.push(step('entity', 'already_satisfied', { id: entity.id, name: entity.name }, null));
    const parentEntity = relation(parent, 'entities_id');
    steps.push(step('parent_location', parentEntity && parentEntity !== input.entity_id ? 'conflict' : 'already_satisfied', { id: parent.id, name: parent.name, entity_id: parentEntity }, null, ['entity'], parentEntity && parentEntity !== input.entity_id ? ['parent_location_entity_mismatch'] : [], false));
    const locationMatches = locations.filter((row) => text(row.name).toLocaleLowerCase() === input.location_name.toLocaleLowerCase() && relation(row, 'locations_id') === input.parent_location_id);
    const location = locationMatches.length === 1 ? locationMatches[0] : undefined;
    const locationEntityMismatch = location && relation(location, 'entities_id') !== input.entity_id;
    const locationNeedsUpdate = location && !locationEntityMismatch && bool(location.is_recursive) !== input.is_recursive;
    steps.push(step('location', locationMatches.length > 1 || locationEntityMismatch ? 'conflict' : locationNeedsUpdate ? 'update' : location ? 'already_satisfied' : 'create', { matches: locationMatches.map((row) => ({ id: row.id, entity_id: relation(row, 'entities_id'), is_recursive: bool(row.is_recursive) })) }, locationNeedsUpdate ? { operation: 'update_location', id: location!.id, is_recursive: input.is_recursive } : location ? null : { operation: 'create_location', name: input.location_name, parent_location_id: input.parent_location_id, entity_id: input.entity_id, is_recursive: input.is_recursive }, ['parent_location'], locationMatches.length > 1 ? ['duplicate_location'] : locationEntityMismatch ? ['location_entity_mismatch'] : [], locationMatches.length > 1));
    const normalizedNetworks = rawNetworks.map((row) => normalizeLegacyIPNetwork(row as any));
    const sourceNetwork = input.source_ip_network_id === undefined ? undefined : normalizedNetworks.find((row) => row.id === input.source_ip_network_id);
    if (input.source_ip_network_id && !sourceNetwork) throw new Error(`Source IPNetwork ${input.source_ip_network_id} was not found`);
    if (sourceNetwork && n(sourceNetwork.entities_id) !== input.entity_id) throw new Error('Source IPNetwork belongs to another entity');
    const exactNetworks = normalizedNetworks.filter((row) => row.cidr === input.cidr && n(row.entities_id) === input.entity_id);
    const overlappingNetworks = normalizedNetworks.filter((row) => row.cidr && row.cidr !== input.cidr).filter((row) => { try { const range = cidrToIPRange(row.cidr!, false); return overlaps(full.ip_start, full.ip_end, range.ip_start, range.ip_end); } catch { return false; } });
    const blockingNetworkOverlaps = overlappingNetworks.filter((row) => row.id !== input.source_ip_network_id);
    const network = exactNetworks.length === 1 ? exactNetworks[0] : undefined;
    const rawNetwork = network ? rawNetworks.find((row) => n(row.id) === network.id) : undefined;
    const networkNeedsUpdate = !!network && (network.name !== input.network_name || text(rawNetwork?.gateway) !== input.gateway || bool(network.is_recursive) !== input.is_recursive || bool(network.addressable) !== input.addressable);
    steps.push(step('ip_network', exactNetworks.length > 1 || blockingNetworkOverlaps.length ? 'conflict' : networkNeedsUpdate ? 'update' : network ? 'already_satisfied' : 'create', { exact: exactNetworks.map((row) => ({ ...row, gateway: rawNetworks.find((raw) => n(raw.id) === row.id)?.gateway })), source: sourceNetwork ?? null, overlaps: overlappingNetworks.map((row) => ({ id: row.id, cidr: row.cidr, entity_id: row.entities_id, accepted_source_parent: row.id === input.source_ip_network_id })) }, networkNeedsUpdate ? { operation: 'update_ip_network', id: network!.id, name: input.network_name, gateway: input.gateway, is_recursive: input.is_recursive, addressable: input.addressable } : network ? null : { operation: 'create_ip_network', name: input.network_name, cidr: input.cidr, gateway: input.gateway, entity_id: input.entity_id, is_recursive: input.is_recursive, addressable: input.addressable }, ['entity'], overlappingNetworks.length ? ['network_overlap_detected'] : [], exactNetworks.length > 1));
    const exactRanges = ranges.filter((row) => text(row.ip_start) === usable.ip_start && text(row.ip_end) === usable.ip_end && relation(row, 'entities_id') === input.entity_id);
    const overlappingRanges = ranges.filter((row) => !exactRanges.includes(row) && text(row.ip_start) && text(row.ip_end) && overlaps(usable.ip_start, usable.ip_end, text(row.ip_start), text(row.ip_end)));
    const inventoryRange = exactRanges.length === 1 ? exactRanges[0] : undefined;
    const inventoryRangeNeedsUpdate = inventoryRange && text(inventoryRange.name) !== input.network_name;
    steps.push(step('inventory_range', exactRanges.length > 1 || overlappingRanges.length ? 'conflict' : inventoryRangeNeedsUpdate ? 'update' : inventoryRange ? 'already_satisfied' : 'create', { exact: exactRanges.map((row) => ({ id: row.id, name: row.name })), overlaps: overlappingRanges.map((row) => ({ id: row.id, ip_start: row.ip_start, ip_end: row.ip_end })) }, inventoryRangeNeedsUpdate ? { operation: 'update_inventory_range', id: inventoryRange!.id, name: input.network_name } : inventoryRange ? null : { operation: 'create_inventory_range', name: input.network_name, ...usable, entity_id: input.entity_id }, ['ip_network'], overlappingRanges.length ? ['inventory_range_overlap'] : [], exactRanges.length > 1));
    let sourceRelations: Record<string, unknown>[] = [];
    if (input.copy_snmp_credentials && input.source_inventory_range_id) {
      const sourceRange = await this.client.getItem<Record<string, unknown>>('PluginGlpiinventoryIPRange', input.source_inventory_range_id, { expand_dropdowns: false });
      if (relation(sourceRange, 'entities_id') !== input.entity_id) throw new Error('Source Inventory range belongs to another entity');
      sourceRelations = await this.inventory.listIPRangeSNMPCredentials({ ip_range_id: input.source_inventory_range_id, limit: 100 }) as Record<string, unknown>[];
      for (const row of sourceRelations) { const credentialId = n(row.snmpcredentials_id ?? row['4']); if (credentialId) await this.client.getItem('SNMPCredential', credentialId, { expand_dropdowns: false }); }
    }
    steps.push(step('snmp_credentials', input.copy_snmp_credentials ? (inventoryRange ? 'update' : 'create') : 'skipped', { source_range_id: input.source_inventory_range_id ?? null, associations: sourceRelations.map((row) => ({ credential_id: n(row.snmpcredentials_id ?? row['4']), rank: n(row.rank ?? row['2']) })) }, input.copy_snmp_credentials ? { operation: 'copy_snmp_associations' } : null, ['inventory_range']));
    const detailedRules: Record<string, unknown>[] = [];
    for (const candidate of rules) {
      try { detailedRules.push(await this.rules.get(n(candidate.id)) as Record<string, unknown>); } catch { /* incomplete candidate is not accepted as exact */ }
    }
    const coveringRules = detailedRules.filter((row) => {
      const criteria = row.criteria as Record<string, unknown>[] ?? []; const actions = row.actions as Record<string, unknown>[] ?? [];
      return criteria.some((item) => (item.criteria === 'subnet' || item.criteria === 'ip') && item.pattern === input.cidr) ||
        (actions.some((item) => item.field === 'entities_id' && n(item.value) === input.entity_id) && text(row.name) === input.rule_name);
    });
    const exactRules = coveringRules.filter((row) => {
      const criteria = row.criteria as Record<string, unknown>[] ?? []; const actions = row.actions as Record<string, unknown>[] ?? [];
      const exactCriterion = (kind: string) => criteria.some((item) => item.criteria === kind && n(item.condition) === 333 && item.pattern === input.cidr);
      return text(row.name) === input.rule_name && text(row.match).toUpperCase() === 'OR' && exactCriterion('subnet') && exactCriterion('ip') &&
        actions.some((item) => item.field === 'entities_id' && n(item.value) === input.entity_id) &&
        (!location || actions.some((item) => item.field === 'locations_id' && n(item.value) === n(location.id)));
    });
    const exactRule = exactRules.length === 1 ? exactRules[0] : undefined;
    const ruleConflict = exactRules.length > 1 || (!exactRule && coveringRules.length > 0);
    steps.push(step('assignment_rule', ruleConflict ? 'conflict' : exactRule ? 'already_satisfied' : 'create', { matches: coveringRules.map((row) => ({ id: row.id, name: row.name, ranking: row.ranking, is_active: row.is_active, match: row.match })) }, exactRule ? null : ruleConflict ? null : { operation: 'create_disabled_rule', name: input.rule_name, match: 'OR', cidr: input.cidr, entity_id: input.entity_id, location_id: location?.id ?? 'pending_location' }, ['location'], ruleConflict ? ['existing_rule_requires_manual_review'] : [], coveringRules.length > 1));
    steps.push(step('rule_criteria', exactRule ? 'already_satisfied' : 'create', { required: [{ criterion: 'subnet', condition: 333, pattern: input.cidr }, { criterion: 'ip', condition: 333, pattern: input.cidr }] }, exactRule ? null : { operation: 'ensure_rule_criteria' }, ['assignment_rule']));
    steps.push(step('rule_actions', exactRule ? 'already_satisfied' : 'create', { required: [{ field: 'entities_id', value: input.entity_id }, { field: 'locations_id', value: location?.id ?? 'pending_location' }] }, exactRule ? null : { operation: 'ensure_rule_actions' }, ['assignment_rule', 'location']));
    const jobPlans = [
      { key: 'discovery_job_target', task: discoveryTask, job: discoveryJob, taskId: input.discovery_task_id, jobId: input.discovery_job_id },
      { key: 'inventory_job_target', task: inventoryTask, job: inventoryJob, taskId: input.inventory_task_id, jobId: input.inventory_job_id },
    ];
    for (const plan of jobPlans) {
      const parentId = n(plan.job.plugin_glpiinventory_tasks_id ?? plan.job.tasks_id); const targets = normalizeTaskJobTargets(plan.job.targets);
      const present = inventoryRange ? targets.some((target) => target.itemtype === IP_RANGE_TARGET && target.id === n(inventoryRange.id)) : false;
      const conflict = parentId !== plan.taskId;
      steps.push(step(plan.key, conflict ? 'conflict' : present ? 'already_satisfied' : 'update', { task_id: plan.task.id, job_id: plan.job.id, method: plan.job.method, targets }, conflict ? null : { operation: 'add_inventory_range_target', ip_range_id: inventoryRange?.id ?? 'pending_inventory_range' }, ['inventory_range'], conflict ? ['task_job_parent_mismatch'] : []));
    }
    const effectiveAddressingOptions = await this.effectiveAddressingOptions(input);
    let addressingEvidence: Record<string, unknown> = { source_addressing_range_id: input.source_addressing_range_id ?? null, copied_options: input.copy_addressing_options, effective_options: effectiveAddressingOptions };
    if (input.source_addressing_range_id) {
      const sourceAddressing = await this.addressing.get(input.source_addressing_range_id) as Record<string, unknown>;
      if (n(sourceAddressing.entity_id) !== input.entity_id) throw new Error('Source Addressing range belongs to another entity');
      addressingEvidence.source = sourceAddressing;
    }
    if (network) {
      const addressPlan = await this.addressing.preview({ ip_network_ids: [network.id], entity_id: input.entity_id, range_policy: 'usable_hosts', adopt_exact_matches: false, defaults: effectiveAddressingOptions, overrides_by_ip_network_id: { [String(network.id)]: { location_id: n(location?.id), ...effectiveAddressingOptions } } });
      addressingEvidence = { ...addressingEvidence, preview: addressPlan };
      const item = addressPlan.items[0]; steps.push(step('addressing', item.action === 'unchanged' ? 'already_satisfied' : item.action === 'conflict' ? 'conflict' : item.action === 'skip' ? 'unsupported' : item.action, addressingEvidence, { operation: 'addressing_sync', action: item.action }, ['ip_network', 'location'], item.warnings, item.action === 'conflict'));
    } else steps.push(step('addressing', 'create', addressingEvidence, { operation: 'addressing_sync_after_ip_network_creation', use_ping: effectiveAddressingOptions.use_ping }, ['ip_network', 'location']));
    const finalDependencies = ['location', 'ip_network', 'inventory_range', 'snmp_credentials', 'assignment_rule', 'rule_criteria', 'rule_actions', 'discovery_job_target', 'inventory_job_target', 'addressing'];
    const finalPending = steps.some((item) => finalDependencies.includes(item.key) && !['already_satisfied', 'skipped'].includes(item.status));
    steps.push(step('final_verification', finalPending ? 'update' : 'already_satisfied', {
      expected: { entity_id: input.entity_id, cidr: input.cidr, inventory_bounds: usable, task_execution_triggered: false },
    }, finalPending ? { operation: 're_read_complete_chain_after_apply' } : null, finalDependencies));
    const conflicts = steps.filter((item) => item.status === 'conflict');
    const body = { intent: 'PROVISION_GLPI_SITE_NETWORK', request: input, expected: { inventory_bounds: usable, addressing_bounds: usable }, steps, applicable: conflicts.length === 0, conflicts: conflicts.map((item) => item.key), no_task_execution: true, no_implicit_network_vlan_fqdn_creation: true };
    return { ...body, preview_fingerprint: fingerprint(body), modifies_data: false };
  }
  async apply(input: SiteNetworkProvisioningApplyRequest): Promise<unknown> {
    const { preview_fingerprint, confirmation: _confirmation, ...request } = input;
    const current = await this.preview(request);
    if ((current as any).preview_fingerprint !== preview_fingerprint) throw new Error('Preview is stale: provisioning dependencies or plan changed');
    if (!(current as any).applicable) throw new Error(`Provisioning plan has conflicts: ${(current as any).conflicts.join(', ')}`);
    const results: Record<string, unknown>[] = []; let locationId = 0; let networkId = 0; let rangeId = 0; let ruleId = 0;
    const record = (key: string, status: string, details: Record<string, unknown>) => results.push({ key, status, ...details });
    try {
      const locationStep = (current as any).steps.find((item: any) => item.key === 'location');
      if (locationStep.status === 'already_satisfied' || locationStep.status === 'update') {
        locationId = n(locationStep.evidence.matches[0].id);
        const verification = locationStep.status === 'update' ? await this.organization.updateLocation(locationId, { recursive: request.is_recursive }) : locationStep.evidence.matches[0];
        record('location', locationStep.status === 'update' ? 'updated' : 'already_satisfied', { id: locationId, verification });
      } else { const created = await this.organization.createLocation({ name: request.location_name, entityId: request.entity_id, parentLocationId: request.parent_location_id, recursive: request.is_recursive }); locationId = idOf(created); if (!locationId) throw new Error('Location creation returned no id'); record('location', 'created', { id: locationId, verification: created }); }
      const networkStep = (current as any).steps.find((item: any) => item.key === 'ip_network');
      if (networkStep.status === 'already_satisfied' || networkStep.status === 'update') {
        networkId = n(networkStep.evidence.exact[0].id);
        if (networkStep.status === 'update') await this.networks.update(networkId, { name: request.network_name, gateway: request.gateway, entity_id: request.entity_id, is_recursive: request.is_recursive, addressable: request.addressable });
        const verification = networkStep.status === 'update' ? await this.networks.get(networkId) : networkStep.evidence.exact[0];
        record('ip_network', networkStep.status === 'update' ? 'updated' : 'already_satisfied', { id: networkId, verification });
      }
      else { const created = await this.networks.create({ name: request.network_name, cidr: request.cidr, gateway: request.gateway, entity_id: request.entity_id, is_recursive: request.is_recursive, addressable: request.addressable }); networkId = idOf(created); if (!networkId) throw new Error('IPNetwork creation returned no id'); const verification = await this.networks.get(networkId); record('ip_network', 'created', { id: networkId, verification }); }
      const rangeStep = (current as any).steps.find((item: any) => item.key === 'inventory_range');
      if (rangeStep.status === 'already_satisfied' || rangeStep.status === 'update') { rangeId = n(rangeStep.evidence.exact[0].id); if (rangeStep.status === 'update') await this.inventory.updateIPRange(rangeId, { name: request.network_name }); const verification = rangeStep.status === 'update' ? await this.inventory.getIPRange(rangeId) : rangeStep.evidence.exact[0]; record('inventory_range', rangeStep.status === 'update' ? 'updated' : 'already_satisfied', { id: rangeId, verification }); }
      else { const bounds = cidrToIPRange(request.cidr, true); const created = await this.inventory.createIPRange({ name: request.network_name, entity_id: request.entity_id, ...bounds }); rangeId = idOf(created); if (!rangeId) throw new Error('Inventory range creation returned no id'); await this.inventory.getIPRange(rangeId); record('inventory_range', 'created', { id: rangeId }); }
      if (request.copy_snmp_credentials && request.source_inventory_range_id) {
        const relations = await this.inventory.listIPRangeSNMPCredentials({ ip_range_id: request.source_inventory_range_id, limit: 100 }) as Record<string, unknown>[];
        for (const relationRow of relations) {
          const credentialId = n(relationRow.snmpcredentials_id ?? relationRow['4']); const rank = n(relationRow.rank ?? relationRow['2']);
          if (!credentialId) continue;
          const existing = await this.inventory.listIPRangeSNMPCredentials({ ip_range_id: rangeId, snmp_credential_id: credentialId, limit: 1 });
          if (!existing.length) {
            await this.inventory.attachSNMPCredentialToIPRange({ ip_range_id: rangeId, snmp_credential_id: credentialId, rank });
            const verified = await this.inventory.listIPRangeSNMPCredentials({ ip_range_id: rangeId, snmp_credential_id: credentialId, limit: 1 });
            if (!verified.length) throw new Error(`SNMP credential association ${credentialId} could not be verified`);
          }
        }
        record('snmp_credentials', 'updated', { source_range_id: request.source_inventory_range_id, count: relations.length });
      } else record('snmp_credentials', 'already_satisfied', { copied: false });
      const ruleStep = (current as any).steps.find((item: any) => item.key === 'assignment_rule');
      if (ruleStep.status === 'already_satisfied') { ruleId = n(ruleStep.evidence.matches[0].id); record('assignment_rule', 'already_satisfied', { id: ruleId }); }
      else {
        const created = await this.client.createItem('RuleImportEntity', {
          name: request.rule_name, sub_type: 'RuleImportEntity', entities_id: request.rule_scope_entity_id,
          match: 'OR', is_active: 0, is_recursive: request.is_recursive ? 1 : 0,
          ...(request.rule_ranking === undefined ? {} : { ranking: request.rule_ranking }),
        });
        ruleId = idOf(created); if (!ruleId) throw new Error('Rule creation returned no id');
        await this.client.getItem('RuleImportEntity', ruleId, { expand_dropdowns: false });
        for (const criterion of ['subnet', 'ip']) {
          const child = await this.client.createItem('RuleCriteria', { rules_id: ruleId, criteria: criterion, condition: 333, pattern: request.cidr });
          await this.rules.getCriterion(ruleId, child.id);
        }
        for (const action of [{ field: 'entities_id', value: String(request.entity_id) }, { field: 'locations_id', value: String(locationId) }]) {
          const child = await this.client.createItem('RuleAction', { rules_id: ruleId, action_type: 'assign', ...action });
          await this.rules.getAction(ruleId, child.id);
        }
        const verification = await this.rules.get(ruleId);
        record('assignment_rule', 'created', { id: ruleId, enabled: false, verification });
      }
      for (const pair of [{ key: 'discovery_job_target', task_id: request.discovery_task_id, job_id: request.discovery_job_id }, { key: 'inventory_job_target', task_id: request.inventory_task_id, job_id: request.inventory_job_id }]) {
        const preview = await this.inventory.previewTaskJobTargetChange({ ...pair, ip_range_id: rangeId, action: 'add' }) as any;
        const result = await this.inventory.applyTaskJobTargetChange({ ...pair, ip_range_id: rangeId, action: 'add', preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_TASK_JOB_TARGET_CHANGE' });
        record(pair.key, (result as any).idempotent ? 'already_satisfied' : 'updated', { result });
      }
      const effectiveAddressingOptions = await this.effectiveAddressingOptions(request);
      const addressPreview = await this.addressing.preview({ ip_network_ids: [networkId], entity_id: request.entity_id, range_policy: 'usable_hosts', adopt_exact_matches: false, defaults: effectiveAddressingOptions, overrides_by_ip_network_id: { [String(networkId)]: { location_id: locationId, ...effectiveAddressingOptions } } });
      const addressResult = await this.addressing.apply({ ip_network_ids: [networkId], entity_id: request.entity_id, range_policy: 'usable_hosts', adopt_exact_matches: false, defaults: effectiveAddressingOptions, overrides_by_ip_network_id: { [String(networkId)]: { location_id: locationId, ...effectiveAddressingOptions } }, preview_fingerprint: addressPreview.fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_ADDRESSING_SYNC', allow_create: true, allow_update: false, update_inferred_metadata: false });
      record('addressing', addressPreview.items[0]?.action === 'unchanged' ? 'already_satisfied' : 'created', { result: addressResult });
      if (request.activate_rule) { await this.rules.setEnabled(ruleId, true); record('rule_activation', 'updated', { id: ruleId, enabled: true }); }
      else record('rule_activation', 'not_attempted', { id: ruleId, enabled: false, reason: 'explicit_activation_not_requested' });
      const finalVerification = await this.preview(request);
      const incomplete = (finalVerification as any).steps.filter((item: any) => ['location', 'ip_network', 'inventory_range', 'assignment_rule', 'discovery_job_target', 'inventory_job_target', 'addressing'].includes(item.key) && item.status !== 'already_satisfied');
      if (!(finalVerification as any).applicable || incomplete.length) throw new Error(`Final provisioning verification failed: ${incomplete.map((item: any) => `${item.key}:${item.status}`).join(', ') || (finalVerification as any).conflicts.join(', ')}`);
      record('final_verification', 'already_satisfied', { fingerprint: (finalVerification as any).preview_fingerprint, ids: { location_id: locationId, ip_network_id: networkId, inventory_range_id: rangeId, rule_id: ruleId } });
      return { success: true, intent: 'PROVISION_GLPI_SITE_NETWORK', preview_fingerprint, resumable: true, ids: { location_id: locationId, ip_network_id: networkId, inventory_range_id: rangeId, rule_id: ruleId }, results, task_execution_triggered: false };
    } catch (error) {
      return { success: false, intent: 'PROVISION_GLPI_SITE_NETWORK', preview_fingerprint, resumable: true, ids: { location_id: locationId || null, ip_network_id: networkId || null, inventory_range_id: rangeId || null, rule_id: ruleId || null }, results, failure: { message: error instanceof Error ? error.message : String(error) }, remaining_steps: 'not_attempted', automatic_rollback: false, task_execution_triggered: false };
    }
  }
}
