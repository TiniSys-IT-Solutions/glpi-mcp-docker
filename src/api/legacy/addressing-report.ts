import { isIP } from 'node:net';
import { GlpiClient } from './glpi-client.js';
import { stableFingerprint, type AddressingSyncService } from '../../core/addressing-sync/service.js';
import { addressingCommentSchema, addressingReportSchema, addressingReservationApplySchema, addressingReservationPreviewSchema,
  type AddressingCommentRequest, type AddressingReportRequest, type AddressingReservationApplyRequest, type AddressingReservationPreviewRequest } from '../../core/addressing-sync/report-schemas.js';

type Row = Record<string, unknown>;
const COMMENT_TYPE = 'GlpiPlugin\\Addressing\\IpComment';
const PAGE_SIZE = 1000;
const MAX_ROWS = 100000;
const n = (value: unknown) => Number(value);

export function addressingIpNumber(ip: string): number {
  if (isIP(ip) !== 4) throw new Error('A canonical IPv4 address is required');
  return ip.split('.').reduce((value, part) => value * 256 + Number(part), 0);
}
function ipString(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

/** Native report storage, audited against Addressing 3.2.11 and GLPI 11.0.11. */
export class LegacyAddressingReportService {
  constructor(private readonly client: GlpiClient, private readonly ranges: Pick<AddressingSyncService, 'get'>) {}

  private async all(itemtype: string): Promise<Row[]> {
    const rows: Row[] = [];
    for (let start = 0; start < MAX_ROWS; start += PAGE_SIZE) {
      const page = await this.client.getItems<Row>(itemtype, { range: `${start}-${start + PAGE_SIZE - 1}`, expand_dropdowns: false });
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
    throw new Error(`${itemtype} exceeds the safety limit; refusing an incomplete report or conflict check`);
  }

  private async range(rangeId: number, ip?: string): Promise<Row> {
    const result = await this.ranges.get(rangeId) as Row;
    const range = result.raw as Row;
    if (!range || n(range.id) !== rangeId || !Number.isInteger(n(range.entities_id)) || n(range.entities_id) < 0) throw new Error('Incomplete Addressing range REST schema');
    if (range.is_deleted === true || n(range.is_deleted) === 1) throw new Error('Addressing range is deleted');
    const begin = addressingIpNumber(String(range.begin_ip));
    const end = addressingIpNumber(String(range.end_ip));
    if (end < begin || end - begin + 1 > 65536) throw new Error('Invalid or oversized Addressing range');
    if (ip !== undefined && (addressingIpNumber(ip) < begin || addressingIpNumber(ip) > end)) throw new Error('IP address is outside the selected Addressing range');
    return range;
  }

  private async auditedPlugin(): Promise<void> {
    const plugins = await this.all('Plugin');
    if (!plugins.some((row) => row.directory === 'addressing' && row.version === '3.2.11' && n(row.state) === 1)) {
      throw new Error('Addressing report writes require active source-audited plugin version 3.2.11');
    }
  }

  private async comments(rangeId: number): Promise<Row[]> {
    const rows = await this.all(COMMENT_TYPE);
    if (rows.some((row) => !['id', 'plugin_addressing_addressings_id', 'ipname', 'comments'].every((field) => Object.hasOwn(row, field)))) throw new Error('Unsupported Addressing IpComment REST schema');
    return rows.filter((row) => n(row.plugin_addressing_addressings_id) === rangeId);
  }

  private commentFor(rows: Row[], ip: string): Row | undefined {
    const matches = rows.filter((row) => row.ipname === `IP${addressingIpNumber(ip)}`);
    if (matches.length > 1) throw new Error(`Multiple report comments exist for ${ip}; refusing an ambiguous operation`);
    return matches[0];
  }

  private async allocations(select: (ip: string) => boolean, knownPorts?: Row[]): Promise<Row[]> {
    const addresses = (await this.all('IPAddress')).filter((row) => isIP(String(row.name)) === 4 && select(String(row.name)));
    if (!addresses.length) return [];
    const names = new Map((await this.all('NetworkName')).map((row) => [n(row.id), row]));
    const ports = new Map((knownPorts ?? await this.all('NetworkPort')).map((row) => [n(row.id), row]));
    const result: Row[] = [];
    for (const address of addresses) {
      // Keep unresolved allocations: they must still block a reservation.
      let port: Row | undefined;
      let networkName: Row | undefined;
      if (address.itemtype === 'NetworkName' && n(address.items_id) > 0) {
        const nameId = n(address.items_id);
        networkName = names.get(nameId);
        if (networkName?.itemtype === 'NetworkPort' && n(networkName.items_id) > 0) {
          const portId = n(networkName.items_id);
          port = ports.get(portId);
        }
      }
      result.push({ ip: address.name, ip_address_id: address.id, network_name_id: networkName?.id,
        port_id: port?.id, port_name: port?.name, asset_type: port?.itemtype, asset_id: port?.items_id,
        entity_id: port?.entities_id ?? address.entities_id, mac: port?.mac ?? '', fqdn_id: networkName?.fqdns_id ?? 0,
        reserved: typeof port?.name === 'string' && port.name.includes('reserv') });
    }
    return result;
  }

  async report(input: AddressingReportRequest) {
    const request = addressingReportSchema.parse(input);
    const range = await this.range(request.range_id);
    const begin = addressingIpNumber(String(range.begin_ip));
    const total = addressingIpNumber(String(range.end_ip)) - begin + 1;
    const comments = await this.comments(request.range_id);
    const allocations = await this.allocations((ip) => {
      const offset = addressingIpNumber(ip) - begin;
      return offset >= request.start && offset < Math.min(total, request.start + request.limit);
    });
    const rows = [];
    for (let offset = request.start; offset < Math.min(total, request.start + request.limit); offset++) {
      const ip = ipString(begin + offset);
      const matches = allocations.filter((row) => row.ip === ip && n(row.entity_id) === n(range.entities_id));
      const comment = this.commentFor(comments, ip);
      rows.push({ ip, comment: String(comment?.comments ?? ''), comment_id: comment?.id,
        status: matches.length > 1 ? 'multiple_assignments' : matches[0]?.reserved ? 'reserved' : matches.length ? 'assigned' : 'unassigned_in_visible_inventory', allocations: matches });
    }
    return { range_id: request.range_id, entity_id: n(range.entities_id), total, start: request.start, limit: request.limit,
      rows, inventory_scope: 'REST-visible records only; unassigned does not prove an IP is unused on the network', ping_performed: false };
  }

  async setComment(input: AddressingCommentRequest) {
    const request = addressingCommentSchema.parse(input);
    await this.range(request.range_id, request.ip);
    await this.auditedPlugin();
    const before = this.commentFor(await this.comments(request.range_id), request.ip);
    const current = String(before?.comments ?? '');
    if (current === request.comment) return { success: true, idempotent: true, comment_id: before?.id, comment: current };
    if (current !== request.expected_comment) throw new Error('Report comment changed; read the report again before replacing it');
    const payload = { plugin_addressing_addressings_id: request.range_id, ipname: `IP${addressingIpNumber(request.ip)}`, comments: request.comment };
    const id = before ? n(before.id) : (await this.client.createItem(COMMENT_TYPE, payload)).id;
    if (before) await this.client.updateItem(COMMENT_TYPE, id, { comments: request.comment });
    try {
      const after = await this.client.getItem<Row>(COMMENT_TYPE, id, { expand_dropdowns: false });
      const verified = after.comments === request.comment && n(after.plugin_addressing_addressings_id) === request.range_id && after.ipname === payload.ipname;
      return { success: verified, comment_id: id, range_id: request.range_id, ip: request.ip, comment: after.comments, verification_status: verified ? 'verified' : 'failed', write_completed: true };
    } catch (error) {
      return { success: false, comment_id: id, write_completed: true, verification_status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
    }
  }

  async previewReservation(input: AddressingReservationPreviewRequest) {
    const request = addressingReservationPreviewSchema.parse(input);
    const range = await this.range(request.range_id, request.ip);
    await this.auditedPlugin();
    const asset = await this.client.getItem<Row>(request.asset_type, request.asset_id, { expand_dropdowns: false });
    if (n(asset.id) !== request.asset_id || n(asset.entities_id) !== n(range.entities_id) || asset.is_deleted === true || n(asset.is_deleted) === 1) throw new Error('Reservation asset must be active and belong to the range entity');
    const fqdnId = request.fqdn_id ?? n(range.fqdns_id ?? 0);
    if (fqdnId > 0) {
      const fqdn = await this.client.getItem<Row>('FQDN', fqdnId, { expand_dropdowns: false });
      if (fqdn.entities_id !== undefined && n(fqdn.entities_id) !== n(range.entities_id) && n(fqdn.is_recursive) !== 1) throw new Error('FQDN is outside the reservation entity');
    }
    const allPorts = await this.all('NetworkPort');
    const allocations = await this.allocations((ip) => ip === request.ip, allPorts);
    const name = `reserv-${request.ip}`;
    const ports = allPorts.filter((row) => row.itemtype === request.asset_type && n(row.items_id) === request.asset_id && row.name === name);
    const matching = allocations.length === 1 && allocations[0].port_name === name && allocations[0].asset_type === request.asset_type && n(allocations[0].asset_id) === request.asset_id && n(allocations[0].entity_id) === n(range.entities_id) && ports.length === 1 && n(ports[0].id) === n(allocations[0].port_id) && n(allocations[0].fqdn_id) === fqdnId && (request.mac === undefined || String(allocations[0].mac).toLowerCase() === request.mac.toLowerCase());
    const action = matching ? 'unchanged' : allocations.length || ports.length ? 'conflict' : 'create';
    const payload = { itemtype: request.asset_type, items_id: request.asset_id, entities_id: n(range.entities_id), name,
      instantiation_type: request.asset_type === 'NetworkEquipment' ? 'NetworkPortAggregate' : 'NetworkPortEthernet',
      _create_children: 1, NetworkName__ipaddresses: { '-100': request.ip }, NetworkName_fqdns_id: fqdnId, mac: request.mac?.toLowerCase() ?? '' };
    const plan = { request, range, asset, allocations, existing_ports: ports, action, payload };
    return { ...plan, applicable: action !== 'conflict', preview_fingerprint: stableFingerprint(plan),
      warnings: ['Conflict checks cover REST-visible inventory only', 'No DHCP or DNS configuration is changed', ...(n(range.reserved_ip) === 1 ? [] : ['The range report currently hides reserved IPs'])], ping_performed: false };
  }

  async reserve(input: AddressingReservationApplyRequest) {
    const { preview_fingerprint, confirmation: _confirmation, ...request } = addressingReservationApplySchema.parse(input);
    const plan = await this.previewReservation(request);
    if (plan.preview_fingerprint !== preview_fingerprint) throw new Error('Reservation preview is stale; preview again');
    if (!plan.applicable) throw new Error('IP already allocated or reservation port already exists; refusing a duplicate');
    if (plan.action === 'unchanged') return { success: true, idempotent: true, port_id: plan.allocations[0].port_id };
    const created = await this.client.createItem('NetworkPort', plan.payload);
    // Preserve the port if a child or readback fails. Returning its id makes partial
    // native child creation reviewable; retries detect it rather than duplicate it.
    try {
      const after = await this.previewReservation(request);
      const verified = after.action === 'unchanged' && n(after.allocations[0]?.port_id) === created.id;
      return { success: verified, port_id: created.id, range_id: request.range_id, ip: request.ip, write_completed: true, verification_status: verified ? 'verified' : 'failed', after };
    } catch (error) {
      return { success: false, port_id: created.id, write_completed: true, verification_status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
    }
  }
}
