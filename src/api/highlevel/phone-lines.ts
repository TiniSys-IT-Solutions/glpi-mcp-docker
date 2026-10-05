import { BusinessPhoneLineService, PhoneLineBackend, PhoneLineRow } from '../../core/phone-lines/service.js';
import { HighLevelClient, HighLevelNotSupportedError } from './client.js';

const FIELDS: Record<string, string> = { entities_id: 'entity', locations_id: 'location', states_id: 'status', linetypes_id: 'type', lineoperators_id: 'operator', users_id: 'user', users_id_tech: 'user_tech', groups_id: 'group', groups_id_tech: 'group_tech' };
const PATHS: Record<string, string> = { Line: 'Management/Line', Entity: 'Administration/Entity', User: 'Administration/User', Group: 'Administration/Group', Location: 'Dropdowns/Location', State: 'Dropdowns/State', LineType: 'Dropdowns/LineType' };
function normalize(row: PhoneLineRow): PhoneLineRow {
  const result = { ...row };
  for (const [legacy, highlevel] of Object.entries(FIELDS)) {
    const value = row[highlevel];
    if (Array.isArray(value)) result[legacy] = value.map((v) => typeof v === 'object' && v !== null ? (v as PhoneLineRow).id : v);
    else if (typeof value === 'object' && value !== null) result[legacy] = (value as PhoneLineRow).id;
    else if (value !== undefined) result[legacy] = value;
  }
  return result;
}
export class HighLevelPhoneLineBackend implements PhoneLineBackend {
  constructor(private readonly client: HighLevelClient) {}
  requireRelations(operation: string): never { throw new HighLevelNotSupportedError(operation); }
  private path(type: string) {
    if (!/^v?2\.3(?:\.0)?$/.test(this.client.apiVersion)) throw new HighLevelNotSupportedError('phone_lines.requires_api_2.3');
    if (!PATHS[type]) throw new HighLevelNotSupportedError(`phone_lines.${type}`);
    return PATHS[type];
  }
  private payload(fields: PhoneLineRow) {
    const result: PhoneLineRow = {};
    for (const [key, value] of Object.entries(fields)) {
      // Recursive writes and group payloads need a separately confirmed schema.
      if (key === 'is_recursive' || key === 'groups_id' || key === 'groups_id_tech') throw new HighLevelNotSupportedError(`phone_lines.write.${key}`);
      if (key === 'lineoperators_id') throw new HighLevelNotSupportedError('phone_lines.write.operator_reference');
      result[FIELDS[key] ?? key] = FIELDS[key] ? { id: value } : value;
    }
    return result;
  }
  async get(type: string, id: number) { return normalize(await this.client.request<PhoneLineRow>(`${this.path(type)}/${id}`)); }
  async page(type: string, start: number, limit: number, deleted = false) {
    if (deleted) throw new HighLevelNotSupportedError('phone_lines.include_deleted');
    const rows = await this.client.request<PhoneLineRow[]>(`${this.path(type)}?start=${start}&limit=${limit}`);
    if (!Array.isArray(rows)) throw new Error('Unexpected High-Level phone line list response');
    return rows.map(normalize);
  }
  async create(type: string, fields: PhoneLineRow) { const row = await this.client.request<PhoneLineRow>(this.path(type), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.payload(fields)) }); return { id: Number(row.id) }; }
  async update(type: string, id: number, fields: PhoneLineRow) { await this.client.request(`${this.path(type)}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.payload(fields)) }); }
  async remove(): Promise<never> { throw new HighLevelNotSupportedError('phone_lines.detach'); }
}
export class HighLevelPhoneLineService extends BusinessPhoneLineService {
  constructor(client: HighLevelClient) { super(new HighLevelPhoneLineBackend(client)); }
}
