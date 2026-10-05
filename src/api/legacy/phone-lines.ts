import { BusinessPhoneLineService, PhoneLineBackend, PhoneLineRow } from '../../core/phone-lines/service.js';
import { GlpiClient } from './glpi-client.js';

export class LegacyPhoneLineBackend implements PhoneLineBackend {
  constructor(private readonly client: GlpiClient) {}
  requireRelations(_operation: string): void {}
  get(type: string, id: number) { return this.client.getItem<PhoneLineRow>(type, id, { expand_dropdowns: false }); }
  page(type: string, start: number, limit: number, deleted = false) { return this.client.getItems<PhoneLineRow>(type, { range: `${start}-${start + limit - 1}`, is_deleted: deleted, expand_dropdowns: false }); }
  create(type: string, fields: PhoneLineRow) { return this.client.createItem(type, fields); }
  async update(type: string, id: number, fields: PhoneLineRow) { await this.client.updateItem(type, id, fields); }
  async remove(type: string, id: number) { await this.client.deleteItem(type, id, true); }
}
export class LegacyPhoneLineService extends BusinessPhoneLineService {
  constructor(client: GlpiClient) { super(new LegacyPhoneLineBackend(client)); }
}
