import { createHash } from 'node:crypto';
import type { ConsumableService } from '../../core/consumables/service.js';
import { consumableApplySchema, consumableChangeSchema, consumableStockSchema, type ConsumableApply, type ConsumableChange, type ConsumableStockSelection } from '../../core/consumables/schemas.js';
import type { GlpiClient } from './glpi-client.js';

type Row = Record<string, unknown>;
function unused(row: Row): boolean { return row.date_out === null || row.date_out === '' || row.date_out === 'NULL'; }
function deleted(row: Row): boolean { return row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true; }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function unitState(row: Row): Row { return { id: row.id, consumable_item_id: row.consumableitems_id, date_in: row.date_in ?? null, date_out: row.date_out, itemtype: row.itemtype ?? null, items_id: row.items_id ?? 0 }; }

export class LegacyConsumableService implements ConsumableService {
  private readonly changing = new Set<number>();
  constructor(private readonly client: GlpiClient) {}
  private async all(itemtype: string, searchText?: Record<string, string>): Promise<Row[]> {
    const rows: Row[] = [];
    for (let start = 0; start < 50000; start += 1000) {
      const page = await this.client.getItems<Row>(itemtype, { range: `${start}-${start + 999}`, expand_dropdowns: false, searchText });
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
    throw new Error(`Incomplete ${itemtype} scan: safety cap reached; no write performed`);
  }
  private async snapshot(id: number): Promise<{ item: Row; units: Row[] }> {
    const item = await this.client.getItem<Row>('ConsumableItem', id, { expand_dropdowns: false });
    if (deleted(item)) throw new Error('Consumable definition is deleted');
    const units = (await this.all('Consumable', { consumableitems_id: String(id) }))
      .filter((unit) => Number(unit.consumableitems_id) === id).sort((a, b) => Number(a.id) - Number(b.id));
    for (const unit of units) if (!Number.isSafeInteger(Number(unit.id)) || Number(unit.id) <= 0 || unit.date_out === undefined) throw new Error('Incomplete consumable unit data; no write performed');
    return { item, units };
  }
  async getStock(input: ConsumableStockSelection): Promise<unknown> {
    const { consumable_item_id: id, start, limit } = consumableStockSchema.parse(input);
    const { item, units } = await this.snapshot(id);
    const available = units.filter(unused).length;
    const threshold = Number(item.alarm_threshold ?? -1); const target = Number(item.stock_target ?? 0);
    return { consumable_item_id: id, name: item.name, entity_id: item.entities_id, location_id: item.locations_id,
      total: units.length, available, assigned: units.length - available, alert_threshold: threshold, stock_target: target,
      below_alert_threshold: threshold >= 0 && available <= threshold,
      suggested_replenishment: target > 0 ? Math.max(0, target - available) : null,
      units: units.slice(start, start + limit), returned: units.slice(start, start + limit).length, total_units: units.length,
      complete: start === 0 && units.length <= limit, modifies_data: false };
  }
  private async validateRecipient(change: Extract<ConsumableChange, { action: 'assign' }>, item: Row): Promise<Row> {
    const recipient = await this.client.getItem<Row>(change.recipient_type, change.recipient_id, { expand_dropdowns: false });
    if (deleted(recipient) || (change.recipient_type === 'User' && ![1, '1', true].includes(recipient.is_active as number | string | boolean))) throw new Error('Recipient is inactive, deleted or activation is unconfirmed');
    const entityId = Number(item.entities_id);
    if (!Number.isSafeInteger(entityId) || entityId < 0) throw new Error('Missing consumable entity');
    const ancestors = new Set<number>([entityId]);
    let current = entityId;
    for (let depth = 0; current !== 0; depth++) {
      if (depth >= 100) throw new Error('Entity ancestry safety limit reached');
      const entity = await this.client.getItem<Row>('Entity', current, { expand_dropdowns: false });
      const parent = Number(entity.entities_id);
      if (!Number.isSafeInteger(parent) || parent < 0 || ancestors.has(parent)) throw new Error('Invalid entity ancestry');
      ancestors.add(parent); current = parent;
    }
    const inScope = (row: Row) => Number(row.entities_id) === entityId ||
      ((row.is_recursive === 1 || row.is_recursive === '1' || row.is_recursive === true) && ancestors.has(Number(row.entities_id)));
    const memberships = change.recipient_type === 'Group' ? [recipient]
      : (await this.all('Profile_User', { users_id: String(change.recipient_id) })).filter((row) => Number(row.users_id) === change.recipient_id);
    if (!memberships.some(inScope)) throw new Error('Recipient has no confirmed membership in the consumable entity');
    // Bind the preview to recipient activation and relevant membership/ACL inputs.
    return { id: recipient.id, is_active: recipient.is_active ?? null, memberships: memberships.map((row) => ({ id: row.id, entities_id: row.entities_id, is_recursive: row.is_recursive, profiles_id: row.profiles_id ?? null })).sort((a, b) => Number(a.id) - Number(b.id)) };
  }
  async previewChange(input: ConsumableChange): Promise<unknown> {
    const change = consumableChangeSchema.parse(input);
    const { item, units } = await this.snapshot(change.consumable_item_id);
    let recipient: Row | null = null;
    if (change.action !== 'add_stock') {
      for (const id of change.consumable_ids) {
        const unit = units.find((row) => Number(row.id) === id);
        if (!unit) throw new Error(`Consumable ${id} is not in the selected definition`);
        if (change.action === 'assign' && !unused(unit)) throw new Error(`Consumable ${id} is already assigned`);
        if (change.action === 'return_to_stock' && unused(unit)) throw new Error(`Consumable ${id} is already in stock`);
      }
      if (change.action === 'assign') recipient = await this.validateRecipient(change, item);
    }
    const before = { item_id: item.id, entity_id: item.entities_id, is_deleted: item.is_deleted ?? 0,
      units: units.map(unitState) };
    const plan = { change, before, recipient };
    return { ...plan, preview_fingerprint: fingerprint(plan), applicable: true, modifies_data: false,
      warnings: ['Snapshot guard, not a distributed transaction. Coordinate writes from other clients.',
        ...(change.action === 'add_stock' ? ['New units use the GLPI server date and inherit its native financial information.'] : []),
        ...(change.action === 'return_to_stock' ? ['Only date_out is cleared, as in the native return-to-stock action; the previous recipient fields are retained.'] : [])] };
  }
  async applyChange(input: ConsumableApply): Promise<unknown> {
    const parsed = consumableApplySchema.parse(input); const change = parsed.change;
    if (this.changing.has(change.consumable_item_id)) throw new Error('A stock change is already in progress for this definition');
    this.changing.add(change.consumable_item_id);
    const completed: number[] = []; const written: number[] = [];
    let attemptedId: number | null = null;
    try {
      const preview = await this.previewChange(change) as { preview_fingerprint: string; before: { entity_id: unknown; units: Row[] }; recipient: Row | null };
      if (preview.preview_fingerprint !== parsed.preview_fingerprint) throw new Error('Stock preview is stale; inspect stock and preview again');
      const targets = change.action === 'add_stock' ? Array.from({ length: change.quantity }, () => null) : change.consumable_ids;
      for (const target of targets) {
        attemptedId = target;
        try {
          const item = await this.client.getItem<Row>('ConsumableItem', change.consumable_item_id, { expand_dropdowns: false });
          if (deleted(item) || Number(item.entities_id) !== Number(preview.before.entity_id)) throw new Error('Consumable definition scope changed before write');
          let id: number;
          if (change.action === 'add_stock') {
            const created = await this.client.createItem('Consumable', { consumableitems_id: change.consumable_item_id });
            id = created.id;
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('GLPI did not return a valid created unit ID');
          } else {
            id = target!;
            // Check the exact selected unit again immediately before its mutation.
            const current = await this.client.getItem<Row>('Consumable', id, { expand_dropdowns: false });
            const expected = preview.before.units.find((row) => Number(row.id) === id);
            if (!expected || fingerprint(unitState(current)) !== fingerprint(expected)) throw new Error('Selected unit changed before write');
            if (change.action === 'assign' && fingerprint(await this.validateRecipient(change, item)) !== fingerprint(preview.recipient)) throw new Error('Recipient scope changed before write');
            await this.client.updateItem('Consumable', id, change.action === 'assign'
              ? { date_out: change.used_on, itemtype: change.recipient_type, items_id: change.recipient_id }
              : { date_out: null });
          }
          written.push(id); attemptedId = id;
          const after = await this.client.getItem<Row>('Consumable', id, { expand_dropdowns: false });
          if (Number(after.consumableitems_id) !== change.consumable_item_id) throw new Error('Consumable ownership verification failed');
          const valid = change.action === 'assign'
            ? String(after.date_out).slice(0, 10) === change.used_on && after.itemtype === change.recipient_type && Number(after.items_id) === change.recipient_id
            : unused(after);
          if (!valid) throw new Error('Stock change verification failed');
          completed.push(id);
        } catch (error) {
          return { success: false, operation: change.action, outcome: 'incomplete_or_uncertain', verified_ids: completed, written_ids: written,
            attempted_id: attemptedId, correlation_id: parsed.correlation_id, message: error instanceof Error ? error.message : String(error),
            retry_warning: 'do_not_retry_blindly; inspect current stock and create a new preview for remaining work' };
        }
      }
      return { success: true, operation: change.action, consumable_item_id: change.consumable_item_id, verified_ids: completed,
        verification_status: 'verified', correlation_id: parsed.correlation_id };
    } finally { this.changing.delete(change.consumable_item_id); }
  }
}
