import { createHash } from 'node:crypto';
import { ItemMetadataService } from '../../core/item-metadata/service.js';
import { ItemMetadataKind } from '../../core/item-metadata/types.js';
import { GlpiClient } from './glpi-client.js';

const ITEMTYPES: Record<ItemMetadataKind, string> = { financial_info: 'Infocom', note: 'Notepad' };
const FORBIDDEN_FIELD = /^(id|itemtype|items_id|date_creation|date_mod|users_id)$/i;
interface MetadataTarget { kind: ItemMetadataKind; itemtype: string; itemId: number; id?: number; }

function safeFields(fields: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(fields)) if (FORBIDDEN_FIELD.test(key)) throw new Error(`Metadata field ${key} is controlled by GLPI`);
  return fields;
}
function numberValue(value: unknown): number { return Number(value ?? 0); }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }

export class LegacyItemMetadataService implements ItemMetadataService {
  constructor(private readonly client: GlpiClient) {}
  private async all(itemtype: string): Promise<Record<string, unknown>[]> {
    const output: Record<string, unknown>[] = [];
    for (let start = 0; start < 50000; start += 1000) {
      const page = await this.client.getItems<Record<string, unknown>>(itemtype, { range: `${start}-${start + 999}`, expand_dropdowns: false });
      output.push(...page); if (page.length < 1000) break;
    }
    return output;
  }
  private async rows(target: MetadataTarget): Promise<Record<string, unknown>[]> {
    return (await this.all(ITEMTYPES[target.kind])).filter((row) => row.itemtype === target.itemtype && numberValue(row.items_id) === target.itemId);
  }
  async list(target: MetadataTarget): Promise<unknown> {
    await this.client.getItem(target.itemtype, target.itemId);
    const items = await this.rows(target);
    return { kind: target.kind, itemtype: target.itemtype, item_id: target.itemId, items, returned: items.length, complete: true, modifies_data: false };
  }
  async get(target: MetadataTarget): Promise<unknown> {
    const rows = await this.rows(target);
    const item = target.kind === 'financial_info' ? rows[0] : rows.find((row) => numberValue(row.id) === target.id);
    if (!item) throw new Error(`${target.kind} not found for item`);
    return { kind: target.kind, item, modifies_data: false };
  }
  async create(input: MetadataTarget & { fields: Record<string, unknown>; correlationId: string }): Promise<unknown> {
    await this.client.getItem(input.itemtype, input.itemId);
    if (input.kind === 'financial_info' && (await this.rows(input)).length > 0) throw new Error('Financial information already exists; use update');
    const created = await this.client.createItem(ITEMTYPES[input.kind], { itemtype: input.itemtype, items_id: input.itemId, ...safeFields(input.fields) });
    return { success: true, operation: 'create_item_metadata', kind: input.kind, id: created.id, after: await this.client.getItem(ITEMTYPES[input.kind], created.id), correlation_id: input.correlationId, verification_status: 'verified' };
  }
  async update(input: MetadataTarget & { fields: Record<string, unknown>; correlationId: string }): Promise<unknown> {
    const before = (await this.get(input) as { item: Record<string, unknown> }).item;
    const id = numberValue(before.id);
    await this.client.updateItem(ITEMTYPES[input.kind], id, safeFields(input.fields));
    return { success: true, operation: 'update_item_metadata', kind: input.kind, before, after: await this.client.getItem(ITEMTYPES[input.kind], id), correlation_id: input.correlationId, verification_status: 'verified' };
  }
  async previewDelete(target: MetadataTarget): Promise<unknown> {
    const current = (await this.get(target) as { item: Record<string, unknown> }).item;
    const plan = { kind: target.kind, itemtype: target.itemtype, item_id: target.itemId, id: numberValue(current.id), current, operation: 'delete_exact_metadata' };
    return { ...plan, preview_fingerprint: fingerprint(plan), applicable: true, modifies_data: false };
  }
  async delete(input: MetadataTarget & { previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown> {
    const preview = await this.previewDelete(input) as Record<string, unknown>;
    if (preview.preview_fingerprint !== input.previewFingerprint) throw new Error('Item metadata delete preview is stale');
    const id = numberValue(preview.id); await this.client.deleteItem(ITEMTYPES[input.kind], id, true);
    return { success: true, operation: 'delete_item_metadata', kind: input.kind, id, before: preview.current, correlation_id: input.correlationId, verification_status: 'request_succeeded' };
  }
}
