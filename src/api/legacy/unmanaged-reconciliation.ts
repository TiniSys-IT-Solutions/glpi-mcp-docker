import { isIP } from 'node:net';
import { UnmanagedReconciliationService } from '../../core/unmanaged-reconciliation/service.js';
import { Confidence, ManagedAssetType, UnmanagedApplyRequest, UnmanagedAuditRequest } from '../../core/unmanaged-reconciliation/types.js';
import { resolveGlpiRelationId } from '../../core/glpi-relations.js';
import { GlpiClient } from './glpi-client.js';

const GENERIC_MACS = new Set(['000000000000', 'ffffffffffff', '020000000000']);
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function normalizeMac(value: unknown): string | null {
  const mac = String(value ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
  return mac.length === 12 ? mac : null;
}
export function classifyMac(value: unknown): 'physical_candidate' | 'multicast' | 'vrrp' | 'null_or_broadcast' | 'locally_administered_candidate' | 'invalid' {
  const mac = normalizeMac(value); if (!mac) return 'invalid';
  if (GENERIC_MACS.has(mac)) return 'null_or_broadcast';
  if (/^00005e0001/.test(mac)) return 'vrrp';
  const first = Number.parseInt(mac.slice(0, 2), 16);
  if ((first & 1) === 1) return 'multicast';
  if ((first & 2) === 2) return 'locally_administered_candidate';
  return 'physical_candidate';
}
export function normalizeIp(value: unknown): string | null {
  const ip = String(value ?? '').trim().replace(/^\[|\]$/g, '').split('%')[0];
  return isIP(ip) ? ip.toLowerCase() : null;
}
export function normalizeHost(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
}
function shortHost(value: string): string { return value.split('.')[0]; }
function normalizeSerial(value: unknown): string | null {
  const serial = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return serial && !/^(unknown|none|n\/a|0+|to be filled)/i.test(serial) ? serial : null;
}
function normalizeText(value: unknown): string { return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
function relation(item: Record<string, unknown>, field: string, type: string): number {
  try { return resolveGlpiRelationId(item, field, type); } catch { return Number(item[field] ?? 0) || 0; }
}
function collect(item: unknown, matcher: RegExp, normalizer: (value: unknown) => string | null): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, key = ''): void => {
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach((entry) => visit(entry, key));
      else Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
    } else if (matcher.test(key)) { const normalized = normalizer(value); if (normalized) found.add(normalized); }
  };
  visit(item); return [...found];
}
function identity(item: Record<string, unknown>) {
  const rawMacs = collect(item, /(^|_)(mac|mac_address|macaddress)(s)?$/i, normalizeMac);
  const macs = rawMacs.filter((mac) => ['physical_candidate', 'locally_administered_candidate'].includes(classifyMac(mac)));
  const ips = collect(item, /(^|_)(ip|ip_address|ipaddress|address)(es)?$/i, normalizeIp);
  const serials = collect(item, /(^|_)(serial|serial_number|serialnumber)$/i, normalizeSerial);
  const name = normalizeHost(item.name ?? item.hostname ?? item.fqdn);
  const fqdn = normalizeHost(item.fqdn);
  return { macs, ignoredMacs: rawMacs.filter((mac) => !['physical_candidate', 'locally_administered_candidate'].includes(classifyMac(mac))).map((mac) => ({ mac, classification: classifyMac(mac) })), ips, serials, name, fqdn, uuid: normalizeSerial(item.uuid), sysdescr: textValue(item.sysdescr ?? item.sysDescr), shortName: shortHost(name), entityId: relation(item, 'entities_id', 'Entity'),
    locationId: relation(item, 'locations_id', 'Location'), manufacturer: normalizeText(item.manufacturer ?? item.manufacturers_id),
    model: normalizeText(item.model ?? item.models_id) };
}
function textValue(value: unknown): string { return String(value ?? '').trim(); }
function intersects(a: string[], b: string[]): string[] { const right = new Set(b); return a.filter((value) => right.has(value)); }
function confidence(score: number): Confidence { return score >= 80 ? 'high' : score >= 40 ? 'medium' : 'low'; }
function weakName(name: string): boolean { return !name || isIP(name) !== 0 || /^\d+$/.test(name) || /^(hub|switch|router|printer|unknown)$/i.test(name); }

export class LegacyUnmanagedReconciliationService implements UnmanagedReconciliationService {
  constructor(private readonly client: GlpiClient) {}
  private async all(type: string, maxRows: number): Promise<Record<string, unknown>[]> {
    return this.client.getItems<Record<string, unknown>>(type, { range: `0-${maxRows - 1}`, expand_dropdowns: false });
  }
  private async entityAllowed(itemEntity: number, requested: number | undefined, recursive: boolean): Promise<boolean> {
    if (requested === undefined || itemEntity === requested) return true;
    if (!recursive) return false;
    const seen = new Set<number>(); let current = itemEntity;
    while (current && !seen.has(current)) {
      seen.add(current);
      const entity = await this.client.getItem<Record<string, unknown>>('Entity', current, { expand_dropdowns: false });
      current = relation(entity, 'entities_id', 'Entity'); if (current === requested) return true;
    }
    return requested === 0;
  }

  async audit(input: UnmanagedAuditRequest): Promise<unknown> {
    const start = input.start ?? 0;
    const genericNamesPolicy = input.genericNamesPolicy ?? 'include';
    const includeEvidence = input.includeEvidence ?? true;
    const rawUnmanaged = await this.all('Unmanaged', input.maxRows);
    const scopedUnmanaged: Record<string, unknown>[] = [];
    for (const item of rawUnmanaged) {
      if (input.unmanagedIds && !input.unmanagedIds.includes(Number(item.id))) continue;
      if (input.createdFrom && String(item.date_creation ?? '') < input.createdFrom) continue;
      if (input.modifiedFrom && String(item.date_mod ?? '') < input.modifiedFrom) continue;
      if (await this.entityAllowed(identity(item).entityId, input.entityId, input.recursive)) scopedUnmanaged.push(item);
    }
    const managed: Array<{ itemtype: ManagedAssetType; item: Record<string, unknown>; identity: ReturnType<typeof identity> }> = [];
    const managedCount: Record<string, number> = {};
    for (const itemtype of input.assetTypes) {
      const rows = await this.all(itemtype, input.maxRows); managedCount[itemtype] = 0;
      for (const item of rows) if (await this.entityAllowed(identity(item).entityId, input.entityId, input.recursive)) {
        managed.push({ itemtype, item, identity: identity(item) }); managedCount[itemtype]++;
      }
    }
    const unmanagedIdentities = scopedUnmanaged.map((item) => ({ item, identity: identity(item) }));
    const results = unmanagedIdentities.map(({ item, identity: source }, sourceIndex) => {
      const duplicates = unmanagedIdentities.filter((other, index) => index !== sourceIndex && (
        intersects(source.macs, other.identity.macs).length > 0 || intersects(source.serials, other.identity.serials).length > 0 ||
        (source.name && source.name === other.identity.name && intersects(source.ips, other.identity.ips).length > 0)
      )).map((other) => Number(other.item.id));
      const candidates = managed.map((target) => {
        const evidence: Array<{ field: string; value: unknown; weight: number }> = []; const conflicts: string[] = [];
        const serials = intersects(source.serials, target.identity.serials); if (serials.length) evidence.push({ field: 'serial', value: serials, weight: 100 });
        const macs = intersects(source.macs, target.identity.macs); if (macs.length) evidence.push({ field: 'mac', value: macs, weight: 90, classification: 'physical_candidate' } as any);
        const ips = intersects(source.ips, target.identity.ips); if (ips.length) evidence.push({ field: 'ip', value: ips, weight: 35 });
        if (source.uuid && source.uuid === target.identity.uuid) evidence.push({ field: 'uuid', value: source.uuid, weight: 100 });
        if (source.name && source.name === target.identity.name && !weakName(source.name)) evidence.push({ field: 'name', value: source.name, weight: 35 });
        else if (source.shortName && source.shortName === target.identity.shortName) evidence.push({ field: 'short_name_fqdn', value: source.shortName, weight: 25 });
        if (source.fqdn && source.fqdn === target.identity.fqdn) evidence.push({ field: 'fqdn', value: source.fqdn, weight: 45 });
        if (source.serials.length && target.identity.serials.length && !serials.length) conflicts.push('different_non_generic_serial');
        if (source.macs.length && target.identity.macs.length && !macs.length) conflicts.push('different_non_generic_mac');
        if (source.entityId && target.identity.entityId && source.entityId !== target.identity.entityId) conflicts.push('incompatible_entity');
        const score = Math.max(0, Math.min(100, evidence.reduce((sum, entry) => sum + entry.weight, 0) - conflicts.length * 60));
        return { itemtype: target.itemtype, id: Number(target.item.id), name: target.item.name, score, confidence: confidence(score), matching_evidence: evidence, conflicts };
      }).filter((candidate) => candidate.score > 0 || candidate.conflicts.length).sort((a, b) => b.score - a.score);
      const positive = candidates.filter((candidate) => candidate.score > 0); const top = positive[0];
      const tied = top ? positive.filter((candidate) => candidate.score === top.score) : [];
      const hasConflict = candidates.some((candidate) => candidate.conflicts.length &&
        candidate.matching_evidence.some((entry) => ['serial', 'mac', 'ip', 'name', 'short_name_fqdn'].includes(entry.field)));
      const weak = (!source.macs.length && !source.serials.length && !source.ips.length) || weakName(source.name);
      const warnings = [source.ignoredMacs.length ? 'generic_or_blacklisted_mac_ignored' : '',
        top && top.matching_evidence.length === 1 && top.matching_evidence[0].field === 'ip' ? 'ip_only_match_is_not_certain' : '',
        tied.length > 1 ? 'multiple_equal_candidates' : ''].filter(Boolean);
      let verdict = duplicates.length ? 'duplicate_unmanaged' : hasConflict ? 'conflict' : tied.length > 1 ? 'ambiguous' :
        top?.confidence === 'high' ? 'exact_match' : top ? 'probable_match' : weak ? 'weak_discovery' : 'unmatched';
      const selectedConfidence: Confidence = top?.confidence ?? 'low';
      return { unmanaged: { id: Number(item.id), name: item.name, entity_id: source.entityId, location_id: source.locationId,
          macs: source.macs, ips: source.ips, serials: source.serials }, verdict, confidence: selectedConfidence,
        score: top?.score ?? 0, candidates: candidates.slice(0, 10), duplicate_unmanaged_ids: duplicates,
        matching_evidence: top?.matching_evidence ?? [], conflicts: top?.conflicts ?? [],
        warnings, _generic_name: weakName(source.name), _sysdescr: source.sysdescr,
        proposed_action: verdict === 'exact_match' && selectedConfidence === 'high' && !hasConflict ? 'link_to_existing_asset' :
          verdict === 'duplicate_unmanaged' ? 'delete_duplicate_unmanaged' : verdict === 'weak_discovery' ? 'review_snmp_support' :
          verdict === 'unmatched' ? 'keep_unmanaged' : 'manual_review', requires_manual_confirmation: true };
    }).filter((result) => CONFIDENCE_RANK[result.confidence] >= CONFIDENCE_RANK[input.minimumConfidence] &&
      (input.includeUnmatched || !['unmatched', 'weak_discovery'].includes(result.verdict)));
    const filtered = results.filter((result) => (!input.onlyExactDuplicates || result.verdict === 'exact_match') &&
      (!input.onlyManagedMatches || result.candidates.length > 0) && (!input.onlyInternalUnmanagedDuplicates || result.duplicate_unmanaged_ids.length > 0) &&
      (input.hasIp === undefined || (result.unmanaged.ips.length > 0) === input.hasIp) &&
      (input.hasMac === undefined || (result.unmanaged.macs.length > 0) === input.hasMac) &&
      (input.hasSerial === undefined || (result.unmanaged.serials.length > 0) === input.hasSerial) &&
      (input.hasSysdescr === undefined || Boolean((result as any)._sysdescr) === input.hasSysdescr) &&
      (genericNamesPolicy === 'include' || (genericNamesPolicy === 'exclude' ? !(result as any)._generic_name : Boolean((result as any)._generic_name))));
    const page = input.fetchAll ? filtered.slice(start, input.maxRows) : filtered.slice(start, start + input.limit);
    const verdicts: Record<string, number> = {}; results.forEach((result) => { verdicts[result.verdict] = (verdicts[result.verdict] ?? 0) + 1; });
    const evidenceCounts: Record<string, number> = { mac: 0, serial: 0, uuid: 0, ip: 0, name: 0, fqdn: 0 };
    results.forEach((result) => result.matching_evidence.forEach((entry) => { if (entry.field in evidenceCounts) evidenceCounts[entry.field]++; }));
    return { summary: { unmanaged_scanned: scopedUnmanaged.length, managed_by_type: managedCount, verdicts, matches_by_signal: evidenceCounts },
      results: page.map((result: any) => { const { _generic_name, _sysdescr, ...visible } = result; if (!includeEvidence) { delete visible.matching_evidence; visible.candidates = visible.candidates.map(({ matching_evidence: _e, ...candidate }: any) => candidate); } if (input.includeRawFields) visible.raw_fields = scopedUnmanaged.find((row) => Number(row.id) === visible.unmanaged.id); return visible; }), pagination: { start, returned: page.length, total_results: filtered.length, incomplete: start + page.length < filtered.length || rawUnmanaged.length >= input.maxRows,
        source_capped: rawUnmanaged.length >= input.maxRows, max_rows: input.maxRows }, modifies_data: false };
  }

  async apply(input: UnmanagedApplyRequest): Promise<unknown> {
    return { success: false, status: 'not_supported', dry_run: input.dryRun, correlation_id: input.correlationId,
      requested_actions: input.actions.length,
      explanation: 'GLPI 11 does not expose a confirmed generic Unmanaged-to-managed reconciliation contract for these actions. No write was attempted.' };
  }
}
