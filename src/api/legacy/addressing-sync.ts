import { GlpiClient } from './glpi-client.js';
import { AddressingSyncService, buildAddressingPlan, ipv4CidrRange } from '../../core/addressing-sync/service.js';
import {
  AddressingApplyRequest, AddressingListRequest, AddressingPreviewRequest,
  AddressingRangeRecord, IPNetworkRecord, LegacyIPNetworkRestRecord,
} from '../../core/addressing-sync/types.js';
import { isIP } from 'node:net';

// GLPI 11 plugins use namespaced class itemtypes. Older plugin releases used
// the pre-namespace form. Both are probed explicitly through the official REST
// search-options endpoint; no write is attempted until the expected fields exist.
export const ADDRESSING_ITEMTYPE_CANDIDATES = [
  'GlpiPlugin\\Addressing\\Addressing',
  'PluginAddressingAddressing',
] as const;

const REQUIRED_REST_FIELDS = [
  'id', 'entities_id', 'name', 'networks_id', 'locations_id', 'fqdns_id', 'vlans_id',
  'begin_ip', 'end_ip', 'alloted_ip', 'double_ip', 'free_ip', 'reserved_ip',
  'use_as_filter', 'use_ping', 'comment', 'is_deleted',
];

// Addressing 3.2.11 rawSearchOptions() deliberately exposes only this subset of
// its own columns. The report toggles (alloted_ip, free_ip, etc.) therefore
// cannot be required from listSearchOptions; they are verified on REST rows.
const REQUIRED_SEARCH_FIELDS = ['id', 'name', 'comment', 'use_ping', 'begin_ip', 'end_ip'];
const REQUIRED_RELATION_TABLES = ['glpi_networks', 'glpi_locations', 'glpi_fqdns', 'glpi_vlans', 'glpi_entities'];
const REST_PAGE_SIZE = 1000;
const MAX_ADDRESSING_RANGES = 100000;

function num(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function markerId(comment: unknown): number | undefined {
  const match = typeof comment === 'string' ? comment.match(/\[mcp-ipnetwork-sync:v1 ipnetwork_id=(\d+)\]/) : undefined;
  return match ? Number(match[1]) : undefined;
}

function netmaskToPrefix(netmask: string): number | undefined {
  if (isIP(netmask) !== 4) return undefined;
  const bits = netmask.split('.').map((part) => Number(part).toString(2).padStart(8, '0')).join('');
  if (!/^1*0*$/.test(bits)) return undefined;
  return bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
}

function canonicalIpv4Cidr(value: string): string | undefined {
  const parts = value.split('/').map((part) => part.trim());
  if (parts.length !== 2) return undefined;
  const suffix = parts[1];
  const prefix = suffix.includes('.') ? netmaskToPrefix(suffix) : Number(suffix);
  if (prefix === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return undefined;
  try { return ipv4CidrRange(`${parts[0]}/${prefix}`, 'full_cidr').canonical_cidr; }
  catch { return undefined; }
}

export function normalizeLegacyIPNetwork(raw: LegacyIPNetworkRestRecord): IPNetworkRecord {
  const base = {
    id: Number(raw.id), name: String(raw.name ?? raw.completename ?? ''), entities_id: num(raw.entities_id),
    is_recursive: raw.is_recursive, addressable: raw.addressable, comment: typeof raw.comment === 'string' ? raw.comment : undefined,
    date_mod: typeof raw.date_mod === 'string' ? raw.date_mod : undefined,
  };
  const explicit = typeof raw.network === 'string' && raw.network.trim() ? raw.network.trim() : undefined;
  const address = typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : undefined;
  const netmask = typeof raw.netmask === 'string' && raw.netmask.trim() ? raw.netmask.trim() : undefined;

  const explicitVersion = explicit ? (explicit.includes(':') ? 6 : isIP(explicit.split('/')[0].trim())) : 0;
  const addressVersion = address ? isIP(address) : 0;
  if (explicitVersion && addressVersion && explicitVersion !== addressVersion) {
    return { ...base, normalization_error: 'ambiguous_ip_network_definition' };
  }
  if (explicit?.includes(':') || address?.includes(':')) return { ...base, cidr: explicit ?? address, };
  const explicitCanonical = explicit ? canonicalIpv4Cidr(explicit) : undefined;
  if (explicit && !explicitCanonical) return { ...base, normalization_error: 'invalid_ipv4_address' };
  if (!address && !netmask) return explicitCanonical ? { ...base, cidr: explicitCanonical } : { ...base, normalization_error: 'missing_address_or_netmask' };
  if (!address || !netmask) return explicitCanonical ? { ...base, cidr: explicitCanonical } : { ...base, normalization_error: 'missing_address_or_netmask' };
  if (isIP(address) !== 4) return { ...base, normalization_error: 'invalid_ipv4_address' };
  const prefix = netmaskToPrefix(netmask);
  if (prefix === undefined) return { ...base, normalization_error: 'invalid_ipv4_netmask' };
  const derived = canonicalIpv4Cidr(`${address}/${prefix}`)!;
  if (explicitCanonical && explicitCanonical !== derived) return { ...base, normalization_error: 'ambiguous_ip_network_definition' };
  return { ...base, cidr: explicitCanonical ?? derived };
}

export class LegacyAddressingSyncService implements AddressingSyncService {
  private resolvedItemtype?: string;

  constructor(private readonly client: GlpiClient) {}

  private async itemtype(): Promise<string> {
    if (this.resolvedItemtype) return this.resolvedItemtype;
    const failures: string[] = [];
    for (const candidate of ADDRESSING_ITEMTYPE_CANDIDATES) {
      try {
        const catalogue = await this.client.searchOptions.get(candidate);
        const missingFields = REQUIRED_SEARCH_FIELDS.filter((field) => !catalogue.byField.has(field));
        const tables = new Set([...catalogue.byId.values()].map((option) => option.table).filter(Boolean));
        const missingTables = REQUIRED_RELATION_TABLES.filter((table) => !tables.has(table));
        if (missingFields.length || missingTables.length) {
          failures.push(`${candidate}: incompatible search options; missing fields ${missingFields.join(', ') || 'none'}; missing relation tables ${missingTables.join(', ') || 'none'}`);
          continue;
        }
        this.resolvedItemtype = candidate;
        return candidate;
      } catch (error) {
        failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`Addressing plugin absent, disabled, inaccessible, or REST schema unsupported. Probes: ${failures.join(' | ')}`);
  }

  private async assertWritableSchema(ranges: AddressingRangeRecord[]): Promise<void> {
    const sample = ranges[0];
    if (!sample) {
      const plugins = await this.client.getItems<Record<string, unknown>>('Plugin', {
        range: '0-9999', expand_dropdowns: false,
      });
      const addressing = plugins.find((plugin) =>
        String(plugin.directory ?? plugin.name ?? '').toLowerCase() === 'addressing'
      );
      if (String(addressing?.version ?? '') === '3.2.11' && num(addressing?.state) === 1) return;
      throw new Error('Addressing write refused: no REST range can prove the complete schema and the installed plugin could not be confirmed as active source-audited version 3.2.11');
    }
    const missing = REQUIRED_REST_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(sample, field));
    if (missing.length) {
      throw new Error(`Addressing write refused: REST rows do not expose required fields: ${missing.join(', ')}`);
    }
  }

  private async pagedRanges(isDeleted: boolean): Promise<AddressingRangeRecord[]> {
    const itemtype = await this.itemtype();
    const rows: AddressingRangeRecord[] = [];
    for (let start = 0; start < MAX_ADDRESSING_RANGES; start += REST_PAGE_SIZE) {
      const page = await this.client.getItems<AddressingRangeRecord>(itemtype, {
        range: `${start}-${start + REST_PAGE_SIZE - 1}`, is_deleted: isDeleted, expand_dropdowns: false,
      });
      rows.push(...page);
      if (page.length < REST_PAGE_SIZE) return rows;
    }
    throw new Error(`Addressing range scan exceeded safety limit ${MAX_ADDRESSING_RANGES}; refusing an incomplete plan`);
  }

  private async allRanges(includeDeleted = true): Promise<AddressingRangeRecord[]> {
    const active = await this.pagedRanges(false);
    if (!includeDeleted) return active;
    const deleted = await this.pagedRanges(true);
    return [...active, ...deleted.filter((row) => !active.some((item) => item.id === row.id))];
  }

  async list(input: AddressingListRequest) {
    const itemtype = await this.itemtype();
    let rows = await this.allRanges(input.include_deleted ?? false);
    rows = rows.filter((row) =>
      (input.entity_id === undefined || num(row.entities_id) === input.entity_id) &&
      (input.location_id === undefined || num(row.locations_id) === input.location_id) &&
      (input.network_id === undefined || num(row.networks_id) === input.network_id) &&
      (input.vlan_id === undefined || num(row.vlans_id) === input.vlan_id) &&
      (input.ip_network_id === undefined || markerId(row.comment) === input.ip_network_id)
    );
    const start = input.start ?? 0;
    const limit = input.limit ?? 50;
    return { itemtype, total: rows.length, start, limit, ranges: rows.slice(start, start + limit).map((row) => this.friendly(row)) };
  }

  async get(rangeId: number) {
    const itemtype = await this.itemtype();
    const row = await this.client.getItem<AddressingRangeRecord>(itemtype, rangeId, { expand_dropdowns: false });
    return { itemtype, ...this.friendly(row), raw: row };
  }

  private friendly(row: AddressingRangeRecord) {
    return { id: row.id, entity_id: num(row.entities_id), name: row.name, begin_ip: row.begin_ip, end_ip: row.end_ip,
      location_id: num(row.locations_id), network_id: num(row.networks_id), vlan_id: num(row.vlans_id), fqdn_id: num(row.fqdns_id),
      ip_network_id: markerId(row.comment), use_as_filter: !!num(row.use_as_filter), alloted_ip: !!num(row.alloted_ip),
      double_ip: !!num(row.double_ip), free_ip: !!num(row.free_ip), reserved_ip: !!num(row.reserved_ip), use_ping: !!num(row.use_ping),
      comment: row.comment ?? '', is_deleted: !!num(row.is_deleted) };
  }

  private async verifyWrite(itemtype: string, id: number, payload: Record<string, unknown>) {
    try {
      const row = await this.client.getItem<AddressingRangeRecord>(itemtype, id, { expand_dropdowns: false });
      const mismatches = Object.entries(payload).filter(([field, expected]) => {
        const actual = row[field];
        if (typeof expected === 'boolean') return Boolean(num(actual)) !== expected;
        if (typeof expected === 'number') return num(actual) !== expected;
        return String(actual ?? '') !== String(expected ?? '');
      }).map(([field]) => field);
      return mismatches.length
        ? { verification_status: 'failed', verification_error: `Mismatched fields: ${mismatches.join(', ')}` }
        : { verification_status: 'verified', range: this.friendly(row) };
    } catch (error) {
      return { verification_status: 'failed', verification_error: error instanceof Error ? error.message : String(error) };
    }
  }

  async preview(input: AddressingPreviewRequest) {
    const itemtype = await this.itemtype();
    let rawSources: LegacyIPNetworkRestRecord[];
    if (input.ip_network_ids) {
      rawSources = await Promise.all(input.ip_network_ids.map((id) =>
        this.client.getItem<LegacyIPNetworkRestRecord>('IPNetwork', id, { expand_dropdowns: false })
      ));
      const returned = new Set(rawSources.map((source) => Number(source.id)));
      const missing = input.ip_network_ids.filter((id) => !returned.has(id));
      if (missing.length) throw new Error(`Explicit IPNetwork selection was incomplete; missing ids: ${missing.join(', ')}`);
    } else {
      const options = { range: `${input.start ?? 0}-${(input.start ?? 0) + (input.limit ?? 100) - 1}`, expand_dropdowns: false };
      rawSources = await this.client.getItems<LegacyIPNetworkRestRecord>('IPNetwork', options);
    }
    let sources = rawSources.map(normalizeLegacyIPNetwork);
    if (input.entity_id !== undefined) sources = sources.filter((row) => num(row.entities_id) === input.entity_id);
    if (input.ip_network_ids && sources.length !== input.ip_network_ids.length) {
      throw new Error('Explicit IPNetwork selection contains ids outside the requested entity scope');
    }
    const ranges = await this.allRanges(true);
    return buildAddressingPlan({ itemtype, sources, ranges, request: input });
  }

  async apply(input: AddressingApplyRequest) {
    const { preview_fingerprint, confirmation: _confirmation, allow_create, allow_update, update_inferred_metadata, ...previewInput } = input;
    const current = await this.preview(previewInput);
    if (current.fingerprint !== preview_fingerprint) throw new Error('Preview is stale: source, target, selection, or options changed');
    const currentRanges = await this.allRanges(true);
    if (current.items.some((item) => item.action === 'create' || item.action === 'update')) {
      await this.assertWritableSchema(currentRanges);
    }
    const results: Array<Record<string, unknown>> = [];
    for (const item of current.items) {
      if (item.action === 'conflict' || item.action === 'skip' || item.action === 'unchanged') {
        results.push({ ip_network_id: item.ip_network_id, action: item.action, reason: item.reason });
        continue;
      }
      if ((item.action === 'create' && allow_create === false) || (item.action === 'update' && allow_update === false)) {
        results.push({ ip_network_id: item.ip_network_id, action: 'skip', reason: `${item.action}_disabled` });
        continue;
      }
      try {
        const payload = { ...(item.proposed_values ?? {}) };
        if (item.action === 'update' && !update_inferred_metadata) {
          const override = previewInput.overrides_by_ip_network_id?.[String(item.ip_network_id)];
          for (const [field, option] of [['locations_id', 'location_id'], ['networks_id', 'network_id'], ['vlans_id', 'vlan_id'], ['fqdns_id', 'fqdn_id']] as const) {
            if (override?.[option] === undefined) delete payload[field];
          }
        }
        if (item.action === 'create') {
          const created = await this.client.createItem(current.itemtype, payload);
          results.push({ ip_network_id: item.ip_network_id, action: 'created', range_id: created.id,
            ...await this.verifyWrite(current.itemtype, created.id, payload) });
        } else {
          await this.client.updateItem(current.itemtype, item.existing_range!.id, payload);
          results.push({ ip_network_id: item.ip_network_id, action: 'updated', range_id: item.existing_range!.id,
            ...await this.verifyWrite(current.itemtype, item.existing_range!.id, payload) });
        }
      } catch (error) {
        results.push({ ip_network_id: item.ip_network_id, action: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { itemtype: current.itemtype, preview_fingerprint, results };
  }
}
