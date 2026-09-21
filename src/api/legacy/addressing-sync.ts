import { GlpiClient } from './glpi-client.js';
import { AddressingSyncService, buildAddressingPlan } from '../../core/addressing-sync/service.js';
import {
  AddressingApplyRequest, AddressingListRequest, AddressingPreviewRequest,
  AddressingRangeRecord, IPNetworkRecord,
} from '../../core/addressing-sync/types.js';

// GLPI 11 plugins use namespaced class itemtypes. Older plugin releases used
// the pre-namespace form. Both are probed explicitly through the official REST
// search-options endpoint; no write is attempted until the expected fields exist.
export const ADDRESSING_ITEMTYPE_CANDIDATES = [
  'GlpiPlugin\\Addressing\\Addressing',
  'PluginAddressingAddressing',
] as const;

const REQUIRED_FIELDS = [
  'id', 'entities_id', 'name', 'networks_id', 'locations_id', 'fqdns_id', 'vlans_id',
  'begin_ip', 'end_ip', 'alloted_ip', 'double_ip', 'free_ip', 'reserved_ip',
  'use_as_filter', 'use_ping', 'comment', 'is_deleted',
];

function num(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function markerId(comment: unknown): number | undefined {
  const match = typeof comment === 'string' ? comment.match(/\[mcp-ipnetwork-sync:v1 ipnetwork_id=(\d+)\]/) : undefined;
  return match ? Number(match[1]) : undefined;
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
        const missing = REQUIRED_FIELDS.filter((field) => !catalogue.byField.has(field));
        if (missing.length) {
          failures.push(`${candidate}: missing REST fields ${missing.join(', ')}`);
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

  private async allRanges(includeDeleted = true): Promise<AddressingRangeRecord[]> {
    const itemtype = await this.itemtype();
    const active = await this.client.getItems<AddressingRangeRecord>(itemtype, {
      range: '0-9999', is_deleted: false, expand_dropdowns: false,
    });
    if (!includeDeleted) return active;
    const deleted = await this.client.getItems<AddressingRangeRecord>(itemtype, {
      range: '0-9999', is_deleted: true, expand_dropdowns: false,
    });
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

  async preview(input: AddressingPreviewRequest) {
    const itemtype = await this.itemtype();
    const options = input.ip_network_ids
      ? { range: '0-9999', expand_dropdowns: false }
      : { range: `${input.start ?? 0}-${(input.start ?? 0) + (input.limit ?? 100) - 1}`, expand_dropdowns: false };
    let sources = await this.client.getItems<IPNetworkRecord>('IPNetwork', options);
    if (input.entity_id !== undefined) sources = sources.filter((row) => num(row.entities_id) === input.entity_id);
    const ranges = await this.allRanges(true);
    return buildAddressingPlan({ itemtype, sources, ranges, request: input });
  }

  async apply(input: AddressingApplyRequest) {
    const { preview_fingerprint, confirmation: _confirmation, allow_create, allow_update, update_inferred_metadata, ...previewInput } = input;
    const current = await this.preview(previewInput);
    if (current.fingerprint !== preview_fingerprint) throw new Error('Preview is stale: source, target, selection, or options changed');
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
          results.push({ ip_network_id: item.ip_network_id, action: 'created', range_id: created.id });
        } else {
          await this.client.updateItem(current.itemtype, item.existing_range!.id, payload);
          results.push({ ip_network_id: item.ip_network_id, action: 'updated', range_id: item.existing_range!.id });
        }
      } catch (error) {
        results.push({ ip_network_id: item.ip_network_id, action: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { itemtype: current.itemtype, preview_fingerprint, results };
  }
}
