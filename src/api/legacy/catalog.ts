import { createHash } from 'node:crypto';
import { CatalogService } from '../../core/catalog/service.js';
import { CatalogSelection } from '../../core/catalog/types.js';
import { GlpiClient } from './glpi-client.js';

const FORBIDDEN_FIELD = /^(id|is_deleted|date_creation|date_mod|password|passwd|secret|community|token|authorization|cookie)$/i;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
const ITEMTYPE_FIELDS: Partial<Record<string, ReadonlySet<string>>> = {
  DeviceMemory: new Set(['designation', 'manufacturers_id', 'devicememorytypes_id', 'frequence', 'size_default', 'comment']),
};
function safeFields(itemtype: string, fields: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(fields)) if (FORBIDDEN_FIELD.test(key)) throw new Error(`Field ${key} is controlled by GLPI or secret and cannot be written through the generic catalog tool`);
  const allowed = ITEMTYPE_FIELDS[itemtype];
  if (allowed) for (const key of Object.keys(fields)) if (!allowed.has(key)) throw new Error(`Field ${key} is not a confirmed writable field for ${itemtype}`);
  return fields;
}
function equal(left: unknown, right: unknown): boolean {
  if ((typeof left === 'number' || typeof left === 'string') && (typeof right === 'number' || typeof right === 'string')) {
    const leftNumber = Number(left); const rightNumber = Number(right);
    if (String(left).trim() !== '' && String(right).trim() !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  }
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export class LegacyCatalogService implements CatalogService {
  constructor(private readonly client: GlpiClient) {}
  async list(input: CatalogSelection & { start: number; limit: number; fetchAll: boolean; includeDeleted: boolean }): Promise<unknown> {
    const cap = input.fetchAll ? 50000 : input.limit; const rows: Record<string, unknown>[] = [];
    for (let start = input.start; rows.length < cap; start += 1000) {
      const size = Math.min(1000, cap - rows.length);
      const page = await this.client.getItems<Record<string, unknown>>(input.itemtype, { range: `${start}-${start + size - 1}`, expand_dropdowns: false, is_deleted: input.includeDeleted });
      rows.push(...page); if (page.length < size) break;
    }
    if (rows.length === 50000) throw new Error(`Safety cap reached for ${input.itemtype}; narrow the selection`);
    return { domain: input.domain, itemtype: input.itemtype, items: rows, returned: rows.length, complete: true, modifies_data: false };
  }
  async get(input: CatalogSelection & { id: number }): Promise<unknown> {
    return { domain: input.domain, itemtype: input.itemtype, item: await this.client.getItem(input.itemtype, input.id, { expand_dropdowns: false }), modifies_data: false };
  }
  async create(input: CatalogSelection & { fields: Record<string, unknown>; correlationId: string }): Promise<unknown> {
    const payload = safeFields(input.itemtype, input.fields); const created = await this.client.createItem(input.itemtype, payload);
    try {
      const after = await this.client.getItem<Record<string, unknown>>(input.itemtype, created.id, { expand_dropdowns: false });
      this.verify(after, payload); return { success: true, operation: 'create', domain: input.domain, itemtype: input.itemtype, id: created.id, after, correlation_id: input.correlationId, verification_status: 'verified' };
    } catch (error) {
      return { success: true, operation: 'create', domain: input.domain, itemtype: input.itemtype, id: created.id, correlation_id: input.correlationId, creation_status: 'succeeded', verification_status: 'failed', verification_message: error instanceof Error ? error.message : String(error), retry_warning: 'do_not_retry_create_blindly' };
    }
  }
  async update(input: CatalogSelection & { id: number; fields: Record<string, unknown>; correlationId: string }): Promise<unknown> {
    const payload = safeFields(input.itemtype, input.fields); const before = await this.client.getItem<Record<string, unknown>>(input.itemtype, input.id, { expand_dropdowns: false });
    await this.client.updateItem(input.itemtype, input.id, payload);
    try {
      const after = await this.client.getItem<Record<string, unknown>>(input.itemtype, input.id, { expand_dropdowns: false });
      this.verify(after, payload);
      return { success: true, operation: 'update', domain: input.domain, itemtype: input.itemtype, id: input.id, before, after, correlation_id: input.correlationId, write_status: 'succeeded', verification_status: 'verified' };
    } catch (error) {
      return { success: true, operation: 'update', domain: input.domain, itemtype: input.itemtype, id: input.id, before, correlation_id: input.correlationId, write_status: 'succeeded', verification_status: 'failed', verification_message: error instanceof Error ? error.message : String(error), retry_warning: 'do_not_retry_update_blindly' };
    }
  }
  async previewDelete(input: CatalogSelection & { id: number; purge: boolean }): Promise<unknown> {
    const current = await this.client.getItem<Record<string, unknown>>(input.itemtype, input.id, { expand_dropdowns: false });
    const plan = { domain: input.domain, itemtype: input.itemtype, id: input.id, purge: input.purge, current,
      reference_scan: { complete: false, reason: 'generic Legacy item reads do not prove absence of every polymorphic relation' },
      recoverability: input.purge ? 'not_recoverable' : 'depends_on_itemtype_soft_delete_support' };
    return { ...plan, preview_fingerprint: fingerprint(plan), applicable: !input.purge, blocked_reasons: input.purge ? ['purge_requires_complete_reference_scan'] : [], modifies_data: false };
  }
  async delete(input: CatalogSelection & { id: number; purge: boolean; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown> {
    const preview = await this.previewDelete(input) as Record<string, unknown>;
    if (preview.preview_fingerprint !== input.previewFingerprint) throw new Error('Delete preview is stale');
    if (input.purge) throw new Error('Purge blocked: reference scan is incomplete');
    const before = preview.current;
    await this.client.deleteItem(input.itemtype, input.id, false, false);
    let after: unknown = null;
    try { after = await this.client.getItem(input.itemtype, input.id, { expand_dropdowns: false }); } catch { after = null; }
    return { success: true, operation: 'soft_delete', domain: input.domain, itemtype: input.itemtype, id: input.id, before, after, correlation_id: input.correlationId, verification_status: after === null || (after as Record<string, unknown>).is_deleted === 1 ? 'verified' : 'outcome_requires_review' };
  }
  private verify(after: Record<string, unknown>, expected: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(expected)) if (!equal(after[key], value)) throw new Error(`Post-write verification failed for ${key}`);
  }
}
