import { createHash } from 'node:crypto';
import {
  AddressingApplyRequest, AddressingListRequest, AddressingPlanItem,
  AddressingPreviewRequest, AddressingPreviewResult, AddressingRangeRecord,
  IPNetworkRecord, MatchEvidence, RangePolicy,
} from './types.js';

export const ADDRESSING_SYNC_MARKER = /\[mcp-ipnetwork-sync:v1 ipnetwork_id=(\d+)\]/;
export const ADDRESSING_MAX_ADDRESSES = 65536n;

export interface AddressingSyncService {
  list(input: AddressingListRequest): Promise<unknown>;
  get(rangeId: number): Promise<unknown>;
  preview(input: AddressingPreviewRequest): Promise<AddressingPreviewResult>;
  apply(input: AddressingApplyRequest): Promise<unknown>;
}

export function stableFingerprint(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (typeof input === 'bigint') return input.toString();
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)])
    );
    return input;
  };
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}

function ipv4ToBigInt(ip: string): bigint {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return parts.reduce((value, part) => (value << 8n) + BigInt(part), 0n);
}

function bigIntToIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join('.');
}

export function ipv4CidrRange(cidr: string, policy: RangePolicy = 'usable_hosts') {
  const [rawIp, rawPrefix, extra] = cidr.trim().split('/');
  if (extra !== undefined || rawPrefix === undefined || rawIp.includes(':')) {
    throw new Error(rawIp.includes(':') ? 'plugin_ipv4_only' : `Invalid IPv4 CIDR: ${cidr}`);
  }
  const prefix = Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  const input = ipv4ToBigInt(rawIp);
  const hostBits = 32n - BigInt(prefix);
  const size = 1n << hostBits;
  const network = input & (0xffffffffn ^ (size - 1n));
  const broadcast = network + size - 1n;
  let begin = network;
  let end = broadcast;
  if (policy === 'usable_hosts' && prefix <= 30) {
    begin += 1n;
    end -= 1n;
  }
  return {
    canonical_cidr: `${bigIntToIpv4(network)}/${prefix}`,
    begin_ip: bigIntToIpv4(begin),
    end_ip: bigIntToIpv4(end),
    address_count: end - begin + 1n,
    cidr_address_count: size,
  };
}

export function appendSyncMarker(comment: string | undefined, ipNetworkId: number): string {
  const marker = `[mcp-ipnetwork-sync:v1 ipnetwork_id=${ipNetworkId}]`;
  const human = (comment ?? '').replace(ADDRESSING_SYNC_MARKER, '').trim();
  return human ? `${human}\n${marker}` : marker;
}

function bool(value: unknown): boolean { return value === true || value === 1 || value === '1'; }
function num(value: unknown): number { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; }

function selectedEvidence(id: number | undefined, method: string): MatchEvidence | undefined {
  return id && id > 0 ? { id, score: method === 'override' ? 1 : 0.95, method } : undefined;
}

export function selectDominantEvidence(
  observations: Array<{ id: number; name?: string; count: number }>,
  minimumCount = 2,
  minimumShare = 0.8,
): MatchEvidence | undefined {
  const eligible = observations.filter((item) => item.id > 0 && item.count > 0).sort((a, b) => b.count - a.count || a.id - b.id);
  const total = eligible.reduce((sum, item) => sum + item.count, 0);
  const winner = eligible[0];
  if (!winner || winner.count < minimumCount || winner.count / total < minimumShare || eligible[1]?.count === winner.count) return undefined;
  return { id: winner.id, name: winner.name, score: winner.count / total, method: 'dominant_equipment_evidence', observations: { count: winner.count, total, candidates: eligible } };
}

export interface BuildPlanInput {
  itemtype: string;
  sources: IPNetworkRecord[];
  ranges: AddressingRangeRecord[];
  request: AddressingPreviewRequest;
}

export function buildAddressingPlan(input: BuildPlanInput): AddressingPreviewResult {
  const request = input.request;
  const policy = request.range_policy ?? 'usable_hosts';
  const selected = request.ip_network_ids ? new Set(request.ip_network_ids) : undefined;
  const items: AddressingPlanItem[] = [];

  for (const source of input.sources) {
    if (selected && !selected.has(source.id)) continue;
    const warnings: string[] = [];
    const base = { ip_network_id: source.id, source, changed_fields: [], warnings };
    if ((request.only_addressable ?? true) && !bool(source.addressable)) {
      items.push({ ...base, action: 'skip', reason: 'ip_network_not_addressable', state_fingerprint: stableFingerprint(source) });
      continue;
    }
    let calculated;
    try { calculated = ipv4CidrRange(source.network, policy); }
    catch (error) {
      const reason = error instanceof Error && error.message === 'plugin_ipv4_only' ? 'plugin_ipv4_only' : 'invalid_cidr';
      items.push({ ...base, action: 'skip', reason, state_fingerprint: stableFingerprint(source) });
      continue;
    }
    if (calculated.cidr_address_count > ADDRESSING_MAX_ADDRESSES) {
      items.push({ ...base, action: 'skip', reason: 'range_exceeds_plugin_limit_65536', state_fingerprint: stableFingerprint(source) });
      continue;
    }
    const entity = num(source.entities_id);
    const marked = input.ranges.filter((range) => Number(range.comment?.match(ADDRESSING_SYNC_MARKER)?.[1]) === source.id);
    const exact = input.ranges.filter((range) => num(range.entities_id) === entity && range.begin_ip === calculated.begin_ip && range.end_ip === calculated.end_ip);
    if (marked.length > 1 || (!marked.length && exact.length > 1)) {
      items.push({ ...base, action: 'conflict', reason: 'multiple_matching_ranges', state_fingerprint: stableFingerprint({ source, marked, exact }) });
      continue;
    }
    let existing = marked[0] ?? exact[0];
    const exactUnmarked = !marked.length && !!existing;
    if (existing && bool(existing.is_deleted)) {
      items.push({ ...base, existing_range: existing, action: 'conflict', reason: 'matching_range_is_deleted', state_fingerprint: stableFingerprint({ source, existing }) });
      continue;
    }
    if (exactUnmarked && !request.adopt_exact_matches) {
      items.push({ ...base, existing_range: existing, action: 'conflict', reason: 'exact_unmarked_match_requires_adoption', state_fingerprint: stableFingerprint({ source, existing }) });
      continue;
    }
    const override = request.overrides_by_ip_network_id?.[String(source.id)] ?? {};
    const existingLocation = existing ? num(existing.locations_id) : 0;
    const existingNetwork = existing ? num(existing.networks_id) : 0;
    const existingVlan = existing ? num(existing.vlans_id) : 0;
    const existingFqdn = existing ? num(existing.fqdns_id) : 0;
    const location = selectedEvidence(override.location_id, 'override') ?? selectedEvidence(existingLocation, 'exact_range');
    const network = selectedEvidence(override.network_id, 'override') ?? selectedEvidence(existingNetwork, 'exact_range');
    const vlan = selectedEvidence(override.vlan_id, 'override') ?? selectedEvidence(existingVlan, 'exact_range');
    const fqdn = selectedEvidence(override.fqdn_id, 'override') ?? selectedEvidence(existingFqdn, 'exact_range');
    if ((request.match_location ?? true) && !location) warnings.push('location_not_inferred');
    if ((request.match_network ?? true) && !network) warnings.push('generic_network_not_inferred');
    if ((request.match_vlan ?? true) && !vlan) warnings.push('vlan_not_inferred');
    if ((request.match_fqdn ?? true) && !fqdn) warnings.push('fqdn_not_inferred');

    const defaults = { use_as_filter: false, alloted_ip: true, double_ip: true, free_ip: true, reserved_ip: true, use_ping: false, ...request.defaults };
    const proposed: Record<string, unknown> = {
      entities_id: entity, name: override.name ?? source.name,
      begin_ip: calculated.begin_ip, end_ip: calculated.end_ip,
      locations_id: location?.id ?? 0, networks_id: network?.id ?? 0,
      vlans_id: vlan?.id ?? 0, fqdns_id: fqdn?.id ?? 0,
      comment: appendSyncMarker(override.comment ?? existing?.comment ?? source.comment, source.id),
    };
    for (const key of ['use_as_filter', 'alloted_ip', 'double_ip', 'free_ip', 'reserved_ip', 'use_ping'] as const) {
      const explicit = override[key] ?? request.defaults?.[key];
      proposed[key] = explicit ?? (existing ? bool(existing[key]) : defaults[key]);
    }
    const comparableFields = Object.keys(proposed);
    const changed = existing ? comparableFields.filter((key) => {
      const before = existing![key]; const after = proposed[key];
      return typeof after === 'boolean' ? bool(before) !== after : String(before ?? '') !== String(after ?? '');
    }) : comparableFields;
    const action = existing ? (changed.length ? 'update' : 'unchanged') : 'create';
    items.push({ ...base, action, existing_range: existing, proposed_range: {
      ...calculated, address_count: calculated.address_count.toString(), cidr_address_count: calculated.cidr_address_count.toString(), ...proposed,
    }, current_values: existing,
      proposed_values: proposed, changed_fields: changed, location, network, vlan, fqdn,
      state_fingerprint: stableFingerprint({ source, existing }) });
  }
  const summary = { create: 0, update: 0, unchanged: 0, skip: 0, conflict: 0 };
  for (const item of items) summary[item.action]++;
  return { itemtype: input.itemtype, fingerprint: stableFingerprint({ request, items }), items, summary };
}
