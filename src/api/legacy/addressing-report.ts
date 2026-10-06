import { isIP } from 'node:net';
import { GlpiClient } from './glpi-client.js';
import { GlpiError } from './http.js';
import { AddressingWebSession, type NativeReportRow } from './addressing-web.js';
import { stableFingerprint, type AddressingSyncService } from '../../core/addressing-sync/service.js';
import { addressingCommentSchema, addressingReportSchema, addressingReservationApplySchema, addressingReservationPreviewSchema,
  type AddressingCommentRequest, type AddressingReportRequest, type AddressingReservationApplyRequest, type AddressingReservationPreviewRequest } from '../../core/addressing-sync/report-schemas.js';

type Row = Record<string, unknown>;
const COMMENT_TYPE = 'GlpiPlugin\\Addressing\\IpComment';
const PING_TYPE = 'GlpiPlugin\\Addressing\\PingInfo';
const PAGE_SIZE = 1000;
const MAX_ROWS = 100000;
const n = (value: unknown) => Number(value);

export function supportsAddressingReports(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/.exec(version);
  return Boolean(match && (Number(match[1]) > 3 || Number(match[1]) === 3 && Number(match[2]) >= 2));
}

export function addressingIpNumber(ip: string): number {
  if (isIP(ip) !== 4) throw new Error('A canonical IPv4 address is required');
  return ip.split('.').reduce((value, part) => value * 256 + Number(part), 0);
}
function ipString(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

/** Native storage: reviewed against Addressing 3.2.11/3.2.14 and GLPI 11.0.11.
 *  A compatible schema never overrides the GLPI resource's permission checks.
 */
export class LegacyAddressingReportService {
  private readonly webWrites = new Map<string, Promise<unknown>>();
  constructor(private readonly client: GlpiClient, private readonly ranges: Pick<AddressingSyncService, 'get'>) {}

  private get nativeWeb(): boolean { return this.client.http?.config?.addressingReportTransport === 'native_web'; }

  private async withWeb<T>(range: Row, action: (web: AddressingWebSession) => Promise<T>): Promise<T> {
    const response = await this.client.getActiveProfile() as Row;
    const profile = response?.active_profile as Row | undefined;
    const rights = n(profile?.plugin_addressing);
    if (!Number.isSafeInteger(rights) || (rights & 1) !== 1) throw new Error('Native Addressing reports require plugin_addressing READ in the active GLPI profile');
    const full = await this.client.getFullSession() as Row;
    const userId = n((full?.session as Row | undefined)?.glpiID);
    const web = new AddressingWebSession(this.client.http.config);
    try { await web.login(userId, n(profile?.id), n(range.entities_id)); return await action(web); }
    finally { await web.close(); }
  }

  private async nativeRows(range: Row, start: number, limit: number): Promise<NativeReportRow[]> {
    const begin = addressingIpNumber(String(range.begin_ip));
    const end = addressingIpNumber(String(range.end_ip));
    const stop = Math.min(end - begin + 1, start + limit);
    if (start >= stop) return [];
    return this.withWeb(range, async web => {
      const found = new Map<string, NativeReportRow>();
      for (let offset = start; offset < stop;) {
        const page = await web.page(n(range.id), offset);
        for (const row of page.rows) {
          const value = addressingIpNumber(row.ip);
          if (value < begin || value > end) throw new Error('Native Addressing report returned an IP outside its range');
          if (value >= begin + start && value < begin + stop) found.set(row.ip, row);
        }
        const previous = offset;
        while (offset < stop && found.has(ipString(begin + offset))) offset++;
        if (offset === previous) throw new Error('Native Addressing report is filtered or incomplete; unreadable IP comments are never assumed empty');
      }
      return Array.from({ length: stop - start }, (_, offset) => found.get(ipString(begin + start + offset))!);
    });
  }

  private async setWebComment(range: Row, request: AddressingCommentRequest) {
    const key = `${request.range_id}:${request.ip}`;
    const previous = this.webWrites.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(() => this.withWeb(range, async web => {
      const offset = addressingIpNumber(request.ip) - addressingIpNumber(String(range.begin_ip));
      const page = await web.page(request.range_id, offset);
      const before = page.rows.find(row => row.ip === request.ip);
      if (!before) throw new Error('Native Addressing IP row is unreadable or filtered; expected_comment cannot be checked');
      if (before.comment === request.comment) return { success: true, idempotent: true, range_id: request.range_id, ip: request.ip,
        comment: before.comment, comment_id: undefined, verification_status: 'verified', write_completed: false, transport: 'native_web' };
      if (before.comment !== request.expected_comment) throw new Error('Report comment changed; read the report again before replacing it');
      try { await web.save(page, request.range_id, request.ip, request.comment); }
      catch (error) { return { success: false, range_id: request.range_id, ip: request.ip, comment_id: undefined, write_completed: null,
        verification_status: 'unavailable', transport: 'native_web', error: error instanceof Error ? error.message : 'Native comment write unavailable',
        recovery: 'Write outcome is unknown. Read the current comment before retrying; this MCP never replays the POST.' }; }
      try {
        const after = (await web.page(request.range_id, offset)).rows.find(row => row.ip === request.ip);
        if (!after) throw new Error('Native comment readback is unavailable');
        const verified = after.comment === request.comment;
        return { success: verified, range_id: request.range_id, ip: request.ip, comment: after.comment, comment_id: undefined,
          verification_status: verified ? 'verified' : 'failed', write_completed: true, transport: 'native_web',
          concurrency: 'Preflight expected_comment and MCP-local serialization; native GLPI has no atomic compare-and-set.' };
      } catch (error) { return { success: false, range_id: request.range_id, ip: request.ip, comment_id: undefined, write_completed: true,
        verification_status: 'unavailable', transport: 'native_web', error: error instanceof Error ? error.message : 'Native comment readback unavailable' }; }
    }));
    this.webWrites.set(key, pending);
    try { return await pending; }
    finally { if (this.webWrites.get(key) === pending) this.webWrites.delete(key); }
  }

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

  private async activePlugin(): Promise<string> {
    const plugins = await this.all('Plugin');
    const active = plugins.filter((row) => row.directory === 'addressing' && n(row.state) === 1);
    if (active.length !== 1) throw new Error('Exactly one active Addressing plugin must be visible through REST');
    const version = String(active[0].version);
    if (!supportsAddressingReports(version)) throw new Error(`Addressing ${version} is unsupported; reports/comments require a stable version >= 3.2.0 and compatible REST resources`);
    return version;
  }

  private async reportResource(itemtype: string, version: string): Promise<Row[]> {
    try {
      return await this.all(itemtype);
    } catch (error) {
      if (error instanceof GlpiError && error.status === 403) {
        throw new Error(`Addressing ${version} is active, but GLPI denied GET ${error.url} (HTTP 403, ${error.glpiCode ?? 'permission denied'}). Addressing 3.2.14 deliberately disables generic REST access to IpComment and PingInfo via canView(); Super-Admin and plugin_addressing=31 do not override it. Range access does not grant report/comment API access. The MCP cannot read or write a comment without an authorized native route; expected_comment is never replaced by an assumed empty value.`, { cause: error });
      }
      throw error;
    }
  }

  private async requireCommentUpdate(): Promise<void> {
    // The native AJAX comment action requires UPDATE, including when it adds
    // the first row. Generic REST CREATE alone must not broaden that right.
    const response = await this.client.getActiveProfile() as Row;
    const profile = response?.active_profile as Row | undefined;
    const rights = n(profile?.plugin_addressing);
    if (!Number.isSafeInteger(rights) || (rights & 2) !== 2) throw new Error('Addressing IP comments require plugin_addressing UPDATE in the active GLPI profile');
  }

  private async auditedPlugin(): Promise<void> {
    // Reservations have a separate payload audit from report/comment storage.
    const plugins = await this.all('Plugin');
    if (!plugins.some((row) => row.directory === 'addressing' && row.version === '3.2.11' && n(row.state) === 1)) {
      throw new Error('Addressing reservations require active source-audited plugin version 3.2.11');
    }
  }

  private async comments(rangeId: number, version: string): Promise<Row[]> {
    const rows = await this.reportResource(COMMENT_TYPE, version);
    if (rows.some((row) => !['id', 'plugin_addressing_addressings_id', 'ipname', 'comments'].every((field) => Object.hasOwn(row, field)))) throw new Error('Unsupported Addressing IpComment REST schema');
    return rows.filter((row) => n(row.plugin_addressing_addressings_id) === rangeId);
  }

  private async pings(rangeId: number, version: string): Promise<Row[]> {
    const rows = await this.reportResource(PING_TYPE, version);
    if (rows.some((row) => !['id', 'plugin_addressing_addressings_id', 'ipname', 'ping_response', 'ping_date'].every((field) => Object.hasOwn(row, field)))) throw new Error('Unsupported Addressing PingInfo REST schema');
    return rows.filter((row) => n(row.plugin_addressing_addressings_id) === rangeId);
  }

  private pingFor(rows: Row[], ip: string) {
    const matches = rows.filter((row) => row.ipname === `IP${addressingIpNumber(ip)}`)
      .sort((a, b) => String(b.ping_date ?? '').localeCompare(String(a.ping_date ?? '')) || n(b.id) - n(a.id));
    const latest = matches[0];
    const ambiguous = latest && matches.some((row) => row.ping_date === latest.ping_date && n(row.ping_response) !== n(latest.ping_response));
    const valid = latest && typeof latest.ping_date === 'string' && latest.ping_date
      && [0, 1, '0', '1'].includes(latest.ping_response as string | number) && !ambiguous;
    return { ping_state: valid ? n(latest.ping_response) === 1 ? 'ok' : 'ko' : 'unknown',
      ping_date: latest?.ping_date ?? null, ping_ambiguous: Boolean(ambiguous) };
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
    const version = await this.activePlugin();
    const begin = addressingIpNumber(String(range.begin_ip));
    const total = addressingIpNumber(String(range.end_ip)) - begin + 1;
    const native = this.nativeWeb ? await this.nativeRows(range, request.start, request.limit) : undefined;
    const comments = native ? [] : await this.comments(request.range_id, version);
    const pings = native ? [] : await this.pings(request.range_id, version);
    const allocations = await this.allocations((ip) => {
      const offset = addressingIpNumber(ip) - begin;
      return offset >= request.start && offset < Math.min(total, request.start + request.limit);
    });
    const rows = [];
    for (let offset = request.start; offset < Math.min(total, request.start + request.limit); offset++) {
      const ip = ipString(begin + offset);
      const matches = allocations.filter((row) => row.ip === ip && n(row.entity_id) === n(range.entities_id));
      const nativeRow = native?.find(row => row.ip === ip);
      const comment = nativeRow ? { comments: nativeRow.comment, id: undefined } : this.commentFor(comments, ip);
      const ping = nativeRow ? { ping_state: nativeRow.ping_state, ping_date: nativeRow.ping_date, ping_ambiguous: false } : this.pingFor(pings, ip);
      const unmanaged = matches.some((row) => row.asset_type === 'Unmanaged');
      // Any visible allocation, including an unresolved one, prevents claiming
      // that a ping reply has no linked equipment.
      const hasVisibleAllocation = allocations.some((row) => row.ip === ip) || nativeRow?.has_linked_equipment;
      rows.push({ ip, comment: String(comment?.comments ?? ''), comment_id: comment?.id,
        ...ping, has_unmanaged_equipment: unmanaged,
        selection_reason: unmanaged ? 'unmanaged_equipment' : ping.ping_state === 'ok' && !hasVisibleAllocation ? 'ping_without_linked_equipment' : null,
        status: matches.length > 1 ? 'multiple_assignments' : matches[0]?.reserved ? 'reserved' : matches.length ? 'assigned' : 'unassigned_in_visible_inventory', allocations: matches });
    }
    return { range_id: request.range_id, entity_id: n(range.entities_id), total, start: request.start, limit: request.limit,
      rows, plugin_version: version, inventory_scope: 'REST-visible records only; absence of equipment is limited to this visibility',
      ping_source: native ? 'persisted Addressing results rendered by GLPI; dates use the GLPI display format and may be stale' : 'persisted Addressing results; dates may be stale', ping_performed: false,
      transport: this.nativeWeb ? 'native_web' : 'legacy_rest' };
  }

  async setComment(input: AddressingCommentRequest) {
    const request = addressingCommentSchema.parse(input);
    const range = await this.range(request.range_id, request.ip);
    const version = await this.activePlugin();
    await this.requireCommentUpdate();
    if (this.nativeWeb) return this.setWebComment(range, request);
    const before = this.commentFor(await this.comments(request.range_id, version), request.ip);
    const current = String(before?.comments ?? '');
    if (current === request.comment) return { success: true, idempotent: true, comment_id: before?.id, range_id: request.range_id, ip: request.ip, comment: current, verification_status: 'verified', write_completed: false };
    if (current !== request.expected_comment) throw new Error('Report comment changed; read the report again before replacing it');
    const payload = { plugin_addressing_addressings_id: request.range_id, ipname: `IP${addressingIpNumber(request.ip)}`, comments: request.comment };
    const id = before ? n(before.id) : (await this.client.createItem(COMMENT_TYPE, payload)).id;
    if (before) await this.client.updateItem(COMMENT_TYPE, id, { id, comments: request.comment });
    try {
      const after = await this.client.getItem<Row>(COMMENT_TYPE, id, { expand_dropdowns: false });
      const verified = after.comments === request.comment && n(after.plugin_addressing_addressings_id) === request.range_id && after.ipname === payload.ipname;
      return { success: verified, comment_id: id, range_id: request.range_id, ip: request.ip, comment: after.comments, verification_status: verified ? 'verified' : 'failed', write_completed: true };
    } catch (error) {
      return { success: false, comment_id: id, range_id: request.range_id, ip: request.ip, write_completed: true, verification_status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
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
