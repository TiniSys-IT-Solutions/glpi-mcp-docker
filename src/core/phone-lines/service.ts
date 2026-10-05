import { stableFingerprint } from '../addressing-sync/service.js';
import { phoneLineListSchema, phoneLineCreateSchema, phoneLineUpdateSchema, phoneLineCommentSchema, phoneLineItemSchema, phoneLineAttachSchema, phoneLineDetachSchema, phoneLineSimPreviewSchema, phoneLineSimApplySchema, PHONE_LINE_ITEMTYPES,
  type PhoneLineListRequest, type PhoneLineCreateRequest, type PhoneLineUpdateRequest, type PhoneLineCommentRequest, type PhoneLineItemRequest, type PhoneLineAttachRequest, type PhoneLineDetachRequest, type PhoneLineSimPreviewRequest, type PhoneLineSimApplyRequest } from './schemas.js';

export type PhoneLineRow = Record<string, unknown>;
export interface PhoneLineBackend {
  requireRelations(operation: string): void;
  get(itemtype: string, id: number): Promise<PhoneLineRow>;
  page(itemtype: string, start: number, limit: number, deleted?: boolean): Promise<PhoneLineRow[]>;
  create(itemtype: string, fields: PhoneLineRow): Promise<{ id: number }>;
  update(itemtype: string, id: number, fields: PhoneLineRow): Promise<void>;
  remove(itemtype: string, id: number): Promise<void>;
}
export interface PhoneLineService {
  list(input: PhoneLineListRequest): Promise<unknown>;
  overview(lineId: number): Promise<unknown>;
  create(input: PhoneLineCreateRequest): Promise<unknown>;
  update(input: PhoneLineUpdateRequest): Promise<unknown>;
  appendComment(input: PhoneLineCommentRequest): Promise<unknown>;
  listItems(lineId: number): Promise<unknown>;
  listItemLines(input: PhoneLineItemRequest): Promise<unknown>;
  attach(input: PhoneLineAttachRequest): Promise<unknown>;
  previewDetach(relationId: number): Promise<unknown>;
  detach(input: PhoneLineDetachRequest): Promise<unknown>;
  previewSim(input: PhoneLineSimPreviewRequest): Promise<unknown>;
  setSim(input: PhoneLineSimApplyRequest): Promise<unknown>;
  audit(input: { entity_id?: number }): Promise<unknown>;
  stats(input: { entity_id?: number }): Promise<unknown>;
}
const n = (v: unknown) => Number(v ?? 0);
const yes = (v: unknown) => v === true || v === 1 || v === '1';
const FIELD_MAP: Record<string, string> = { caller_number: 'caller_num', entity_id: 'entities_id', location_id: 'locations_id', state_id: 'states_id', type_id: 'linetypes_id', operator_id: 'lineoperators_id', assigned_user_id: 'users_id', assigned_technician_id: 'users_id_tech', group_ids: 'groups_id', technician_group_ids: 'groups_id_tech' };
const REFERENCES: Record<string, string> = { entity_id: 'Entity', location_id: 'Location', state_id: 'State', type_id: 'LineType', operator_id: 'LineOperator', assigned_user_id: 'User', assigned_technician_id: 'User' };
function safeSim(row: PhoneLineRow): PhoneLineRow {
  // Explicit projection: native SIM rows can contain PIN/PUK or plugin secrets.
  return Object.fromEntries(['id', 'itemtype', 'items_id', 'devicesimcards_id', 'entities_id', 'is_deleted', 'lines_id', 'serial', 'otherserial'].filter((k) => Object.hasOwn(row, k)).map((k) => [k, row[k]]));
}
function friendly(row: PhoneLineRow) {
  return { ...row, ...Object.fromEntries(Object.entries(FIELD_MAP).map(([alias, field]) => [alias, row[field]])) };
}

export class BusinessPhoneLineService implements PhoneLineService {
  constructor(private readonly backend: PhoneLineBackend) {}
  private async all(itemtype: string, deleted = false) {
    const rows: PhoneLineRow[] = [];
    for (let start = 0; start < 50000; start += 1000) {
      const page = await this.backend.page(itemtype, start, 1000, deleted);
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
    throw new Error(`Phone line ${itemtype} scan reached safety cap; refusing incomplete data`);
  }
  private async line(id: number, active = false) {
    const row = await this.backend.get('Line', id);
    if (n(row.id) !== id || !Number.isSafeInteger(n(row.entities_id)) || n(row.entities_id) < 0) throw new Error('Incomplete Line REST schema');
    if (active && yes(row.is_deleted)) throw new Error('Phone line is deleted');
    return row;
  }
  private async entityCompatible(owner: PhoneLineRow, entity: number): Promise<boolean> {
    if (!Object.hasOwn(owner, 'entities_id') || !Number.isSafeInteger(n(owner.entities_id)) || n(owner.entities_id) < 0) throw new Error('Cannot verify reference entity scope');
    const source = n(owner.entities_id);
    if (source === entity) return true;
    if (!yes(owner.is_recursive)) return false;
    const visited = new Set<number>();
    let current = entity;
    while (current > 0 && visited.size < 256 && !visited.has(current)) {
      visited.add(current);
      const row = await this.backend.get('Entity', current);
      if (!Object.hasOwn(row, 'entities_id')) throw new Error('Cannot verify entity ancestry');
      current = n(row.entities_id);
      if (current === source) return true;
    }
    return false;
  }
  private async item(type: string, id: number) {
    if (!(PHONE_LINE_ITEMTYPES as readonly string[]).includes(type)) throw new Error('Unsupported phone line equipment type');
    const item = await this.backend.get(type, id);
    if (n(item.id) !== id || yes(item.is_deleted) || !Object.hasOwn(item, 'entities_id')) throw new Error('Phone line equipment must exist, be active and expose its entity');
    return item;
  }
  private payload(fields: PhoneLineRow) {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => [FIELD_MAP[key] ?? key, value]));
  }
  private async validateReferences(fields: PhoneLineRow, entityId: number) {
    for (const [key, type] of Object.entries(REFERENCES)) {
      if (fields[key] === undefined || (n(fields[key]) === 0 && key !== 'entity_id')) continue;
      const reference = await this.backend.get(type, n(fields[key]));
      if (yes(reference.is_deleted)) throw new Error(`${type} reference is deleted`);
      if (type !== 'Entity' && type !== 'User' && Object.hasOwn(reference, 'entities_id') && !await this.entityCompatible(reference, entityId)) throw new Error(`${type} reference is outside the phone line entity`);
    }
    for (const key of ['group_ids', 'technician_group_ids']) {
      for (const id of (fields[key] as number[] | undefined) ?? []) {
        const group = await this.backend.get('Group', id);
        const eligibility = key === 'technician_group_ids' ? 'is_assign' : 'is_itemgroup';
        if (!await this.entityCompatible(group, entityId) || n(group[eligibility]) !== 1) throw new Error('Group is outside the line entity or cannot be assigned for the requested role');
      }
    }
  }
  private async verify(type: string, id: number, expected: PhoneLineRow) {
    try {
      const after = await this.backend.get(type, id);
      const mismatches = Object.keys(expected).filter((key) => {
        const actual = after[key], value = expected[key];
        if (Array.isArray(value)) return !Array.isArray(actual) || stableFingerprint([...value].sort()) !== stableFingerprint([...actual].map(Number).sort());
        return typeof value === 'boolean' ? yes(actual) !== value : String(actual ?? '') !== String(value ?? '');
      });
      return { verification_status: mismatches.length ? 'failed' : 'verified', mismatched_fields: mismatches, after: type === 'Item_DeviceSimcard' ? safeSim(after) : after };
    } catch (error) {
      return { verification_status: 'unavailable', verification_message: error instanceof Error ? error.message : String(error) };
    }
  }
  private async selected(input: PhoneLineListRequest) {
    const request = phoneLineListSchema.parse(input);
    let rows = await this.all('Line');
    if (request.include_deleted) rows.push(...await this.all('Line', true));
    const seen = new Set<number>();
    rows = rows.filter((row) => { const id = n(row.id); if (seen.has(id)) return false; seen.add(id); return request.include_deleted || !yes(row.is_deleted); });
    rows = rows.filter((row) => {
      for (const key of ['entity_id', 'location_id', 'state_id', 'type_id', 'operator_id', 'assigned_user_id', 'assigned_technician_id'] as const) if (request[key] !== undefined && n(row[FIELD_MAP[key]]) !== request[key]) return false;
      if (request.caller_number !== undefined && String(row.caller_num ?? '') !== request.caller_number) return false;
      const text = request.text_search?.toLocaleLowerCase();
      return !text || ['name', 'caller_num', 'caller_name', 'comment'].some((key) => String(row[key] ?? '').toLocaleLowerCase().includes(text));
    });
    return { request, rows };
  }
  async list(input: PhoneLineListRequest) {
    const { request, rows } = await this.selected(input);
    return { lines: rows.slice(request.start, request.start + request.limit).map(friendly), total: rows.length, start: request.start, limit: request.limit, complete: true, modifies_data: false };
  }
  private async associations(lineId: number) {
    const direct = (await this.all('Item_Line')).filter((r) => n(r.lines_id) === lineId);
    const simcards = (await this.all('Item_DeviceSimcard')).filter((r) => n(r.lines_id) === lineId && !yes(r.is_deleted)).map(safeSim);
    return { direct, simcards };
  }
  async listItems(lineId: number) {
    this.backend.requireRelations('glpi_list_phone_line_items');
    await this.line(lineId);
    return { line_id: lineId, ...await this.associations(lineId), complete: true, modifies_data: false };
  }
  async overview(lineId: number) {
    this.backend.requireRelations('glpi_get_phone_line_overview');
    const line = await this.line(lineId);
    const sections: Record<string, unknown> = {};
    let complete = true;
    try { sections.items = await this.associations(lineId); }
    catch (error) { complete = false; sections.items = { unavailable: true, error: error instanceof Error ? error.message : String(error) }; }
    for (const [name, type, field] of [['contracts', 'Contract_Item', 'items_id'], ['documents', 'Document_Item', 'items_id'], ['financial_info', 'Infocom', 'items_id'], ['notes', 'Notepad', 'items_id'], ['history', 'Log', 'items_id']] as const) {
      try { sections[name] = (await this.all(type)).filter((row) => row.itemtype === 'Line' && n(row[field]) === lineId); }
      catch (error) { complete = false; sections[name] = { unavailable: true, error: error instanceof Error ? error.message : String(error) }; }
    }
    return { line: friendly(line), ...sections, complete, modifies_data: false };
  }
  async create(input: PhoneLineCreateRequest) {
    const request = phoneLineCreateSchema.parse(input);
    await this.validateReferences(request, request.entity_id);
    const payload = this.payload(request);
    const created = await this.backend.create('Line', payload);
    if (!Number.isSafeInteger(created.id) || created.id <= 0) throw new Error('Line create did not return a valid id; review the API response before retrying');
    return { id: created.id, write_completed: true, ...await this.verify('Line', created.id, payload) };
  }
  async update(input: PhoneLineUpdateRequest) {
    const { line_id, ...fields } = phoneLineUpdateSchema.parse(input);
    const before = await this.line(line_id, true);
    const entity = fields.entity_id ?? n(before.entities_id);
    if (entity !== n(before.entities_id)) {
      this.backend.requireRelations('phone_line_entity_move');
      const links = await this.associations(line_id);
      if (links.direct.length || links.simcards.length) throw new Error('Remove equipment/SIM associations before changing the line entity');
    }
    // Revalidate persisted dropdowns when changing entity, not only supplied fields.
    const checked = { ...fields } as PhoneLineRow;
    if (entity !== n(before.entities_id)) for (const alias of [...Object.keys(REFERENCES), 'group_ids', 'technician_group_ids']) if (checked[alias] === undefined && FIELD_MAP[alias] && before[FIELD_MAP[alias]] !== undefined) checked[alias] = before[FIELD_MAP[alias]];
    await this.validateReferences(checked, entity);
    const payload = this.payload(fields);
    await this.backend.update('Line', line_id, payload);
    return { line_id, before: friendly(before), write_completed: true, ...await this.verify('Line', line_id, payload) };
  }
  async appendComment(input: PhoneLineCommentRequest) {
    const request = phoneLineCommentSchema.parse(input);
    const row = await this.line(request.line_id, true);
    const desired = request.expected_comment ? `${request.expected_comment}\n${request.text}` : request.text;
    if (desired.length > 65535) throw new Error('Appended comment exceeds the supported length');
    if (String(row.comment ?? '') === desired) return { line_id: request.line_id, idempotent: true, verification_status: 'verified' };
    if (String(row.comment ?? '') !== request.expected_comment) throw new Error('Line comment changed; reread it before appending');
    return this.update({ line_id: request.line_id, comment: desired });
  }
  async listItemLines(input: PhoneLineItemRequest) {
    this.backend.requireRelations('glpi_list_item_phone_lines');
    const request = phoneLineItemSchema.parse(input);
    await this.item(request.itemtype, request.item_id);
    const direct = (await this.all('Item_Line')).filter((r) => r.itemtype === request.itemtype && n(r.items_id) === request.item_id);
    const simcards = (await this.all('Item_DeviceSimcard')).filter((r) => r.itemtype === request.itemtype && n(r.items_id) === request.item_id && n(r.lines_id) > 0 && !yes(r.is_deleted)).map(safeSim);
    const ids = new Set([...direct, ...simcards].map((row) => n(row.lines_id)));
    const lines = (await this.all('Line')).filter((row) => ids.has(n(row.id))).map(friendly);
    return { ...request, direct, simcards, lines, complete: true, modifies_data: false };
  }
  async attach(input: PhoneLineAttachRequest) {
    this.backend.requireRelations('glpi_attach_phone_line_to_item');
    const request = phoneLineAttachSchema.parse(input);
    const line = await this.line(request.line_id, true);
    const item = await this.item(request.itemtype, request.item_id);
    if (!await this.entityCompatible(line, n(item.entities_id))) throw new Error('Equipment is outside the line entity scope');
    const matches = (await this.all('Item_Line')).filter((r) => n(r.lines_id) === request.line_id && r.itemtype === request.itemtype && n(r.items_id) === request.item_id);
    if (matches.length > 1) throw new Error('Multiple identical line links; refusing ambiguity');
    if (matches[0]) return { idempotent: true, relation_id: n(matches[0].id), verification_status: 'verified' };
    const payload = { lines_id: request.line_id, itemtype: request.itemtype, items_id: request.item_id };
    const created = await this.backend.create('Item_Line', payload);
    return { relation_id: created.id, write_completed: true, ...await this.verify('Item_Line', created.id, payload) };
  }
  async previewDetach(relationId: number) {
    this.backend.requireRelations('glpi_preview_detach_phone_line_from_item');
    const current = await this.backend.get('Item_Line', relationId);
    const line = await this.line(n(current.lines_id));
    const item = await this.item(String(current.itemtype), n(current.items_id));
    const plan = { relation_id: relationId, current, line, item, operation: 'detach_direct_line_link_only' };
    return { ...plan, preview_fingerprint: stableFingerprint(plan), modifies_data: false };
  }
  async detach(input: PhoneLineDetachRequest) {
    const request = phoneLineDetachSchema.parse(input);
    const preview = await this.previewDetach(request.relation_id);
    if (preview.preview_fingerprint !== request.preview_fingerprint) throw new Error('Phone line detach preview is stale');
    await this.backend.remove('Item_Line', request.relation_id);
    try {
      const remaining = (await this.all('Item_Line')).some((r) => n(r.id) === request.relation_id);
      return { relation_id: request.relation_id, write_completed: true, verification_status: remaining ? 'failed' : 'verified', preserves_line_equipment_and_simcards: true };
    } catch (error) {
      return { relation_id: request.relation_id, write_completed: true, verification_status: 'unavailable', verification_message: error instanceof Error ? error.message : String(error) };
    }
  }
  async previewSim(input: PhoneLineSimPreviewRequest) {
    this.backend.requireRelations('glpi_preview_set_simcard_phone_line');
    const request = phoneLineSimPreviewSchema.parse(input);
    const raw = await this.backend.get('Item_DeviceSimcard', request.simcard_relation_id);
    if (n(raw.id) !== request.simcard_relation_id || yes(raw.is_deleted) || !Object.hasOwn(raw, 'lines_id')) throw new Error('SIM installation is deleted or has no confirmed line field');
    const current = safeSim(raw);
    const item = await this.item(String(current.itemtype), n(current.items_id));
    const oldLine = n(current.lines_id) > 0 ? await this.line(n(current.lines_id)) : undefined;
    const line = request.line_id > 0 ? await this.line(request.line_id, true) : undefined;
    if (line && !await this.entityCompatible(line, n(item.entities_id))) throw new Error('SIM equipment is outside the line entity scope');
    const plan = { request, current, item, old_line: oldLine, target_line: line, action: n(current.lines_id) === request.line_id ? 'unchanged' : request.line_id === 0 ? 'clear' : 'set' };
    return { ...plan, preview_fingerprint: stableFingerprint(plan), modifies_data: false };
  }
  async setSim(input: PhoneLineSimApplyRequest) {
    const { preview_fingerprint, confirmation: _confirmation, ...request } = phoneLineSimApplySchema.parse(input);
    const preview = await this.previewSim(request);
    if (preview.preview_fingerprint !== preview_fingerprint) throw new Error('SIM phone line preview is stale');
    if (preview.action === 'unchanged') return { idempotent: true, verification_status: 'verified' };
    const payload = { lines_id: request.line_id };
    await this.backend.update('Item_DeviceSimcard', request.simcard_relation_id, payload);
    return { simcard_relation_id: request.simcard_relation_id, write_completed: true, preserves_simcard: true, ...await this.verify('Item_DeviceSimcard', request.simcard_relation_id, payload) };
  }
  async audit(input: { entity_id?: number }) {
    this.backend.requireRelations('glpi_audit_phone_lines');
    const lines = (await this.selected(input)).rows;
    const direct = await this.all('Item_Line'), sims = await this.all('Item_DeviceSimcard');
    const numbers = new Map<string, number[]>();
    const findings: PhoneLineRow[] = [];
    for (const row of lines) {
      const id = n(row.id), number = String(row.caller_num ?? '').trim();
      // Preserve extensions, international prefixes and dial-plan punctuation.
      // Only whitespace is ignored; duplicates are potential conflicts, not errors.
      if (number) { const key = `${n(row.entities_id)}:${number.replace(/\s+/g, '')}`; numbers.set(key, [...numbers.get(key) ?? [], id]); }
      else findings.push({ line_id: id, issue: 'missing_caller_number' });
      if (!n(row.lineoperators_id)) findings.push({ line_id: id, issue: 'missing_operator' });
      if (!direct.some((r) => n(r.lines_id) === id) && !sims.some((r) => n(r.lines_id) === id && !yes(r.is_deleted))) findings.push({ line_id: id, issue: 'no_equipment_or_sim_association' });
    }
    for (const [number, ids] of numbers) if (ids.length > 1) findings.push({ issue: 'potential_duplicate_number_in_entity', number, line_ids: ids });
    const visible = new Set(lines.map((r) => n(r.id)));
    const scopedIds = input.entity_id === undefined ? undefined : visible;
    for (const row of direct) if (!visible.has(n(row.lines_id)) && scopedIds === undefined) findings.push({ issue: 'direct_link_line_not_visible_or_deleted', relation_id: row.id, line_id: row.lines_id });
    const byId = new Map(lines.map((row) => [n(row.id), row]));
    for (const sim of sims.filter((row) => !yes(row.is_deleted) && n(row.lines_id) > 0)) {
      const line = byId.get(n(sim.lines_id));
      if (!line && scopedIds === undefined) findings.push({ issue: 'sim_line_not_visible_or_deleted', simcard_relation_id: sim.id, line_id: sim.lines_id });
      if (line && Object.hasOwn(sim, 'entities_id') && !yes(line.is_recursive) && n(sim.entities_id) !== n(line.entities_id)) findings.push({ issue: 'sim_line_entity_mismatch', simcard_relation_id: sim.id, line_id: line.id });
    }
    return { findings, scanned_lines: lines.length, complete: true, scope: 'REST-visible active inventory only', modifies_data: false };
  }
  async stats(input: { entity_id?: number }) {
    const rows = (await this.selected(input)).rows;
    const distributions = Object.fromEntries(['entity_id', 'operator_id', 'type_id', 'state_id', 'location_id'].map((alias) => {
      const counts: Record<string, number> = {};
      for (const row of rows) { const key = String(n(row[FIELD_MAP[alias]])); counts[key] = (counts[key] ?? 0) + 1; }
      return [alias, counts];
    }));
    return { total: rows.length, distributions, scope: 'REST-visible active lines only', modifies_data: false };
  }
}
