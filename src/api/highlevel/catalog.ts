import { createHash } from 'node:crypto';
import { CatalogService } from '../../core/catalog/service.js';
import { CatalogDomain, CatalogSelection } from '../../core/catalog/types.js';
import { HighLevelClient } from './client.js';

const ROOT: Record<CatalogDomain, string> = { asset: 'Assets', component: 'Components', dropdown: 'Dropdowns', management: 'Management' };
const forbidden = /^(id|is_deleted|date_creation|date_mod|password|passwd|secret|community|token|authorization|cookie)$/i;
function body(fields: Record<string, unknown>): RequestInit {
  for (const key of Object.keys(fields)) if (forbidden.test(key)) throw new Error(`Field ${key} cannot be written through the generic catalog tool`);
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) };
}
function path(input: CatalogSelection, id?: number): string { return `${ROOT[input.domain]}/${input.itemtype}${id === undefined ? '' : `/${id}`}`; }
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export class HighLevelCatalogService implements CatalogService {
  constructor(private readonly client: HighLevelClient) {}
  async list(input: CatalogSelection & { start: number; limit: number; fetchAll: boolean; includeDeleted: boolean }): Promise<unknown> {
    const data = await this.client.request(`${path(input)}?start=${input.start}&limit=${input.fetchAll ? 10000 : input.limit}`);
    return { domain: input.domain, itemtype: input.itemtype, items: data, modifies_data: false };
  }
  async get(input: CatalogSelection & { id: number }): Promise<unknown> { return { domain: input.domain, itemtype: input.itemtype, item: await this.client.request(path(input, input.id)), modifies_data: false }; }
  async create(input: CatalogSelection & { fields: Record<string, unknown>; correlationId: string }): Promise<unknown> {
    const created = await this.client.request(path(input), { ...body(input.fields), method: 'POST' });
    return { success: true, operation: 'create', result: created, correlation_id: input.correlationId };
  }
  async update(input: CatalogSelection & { id: number; fields: Record<string, unknown>; correlationId: string }): Promise<unknown> {
    const before = await this.client.request(path(input, input.id)); await this.client.request(path(input, input.id), { ...body(input.fields), method: 'PATCH' });
    const after = await this.client.request(path(input, input.id)); return { success: true, operation: 'update', before, after, correlation_id: input.correlationId };
  }
  async previewDelete(input: CatalogSelection & { id: number; purge: boolean }): Promise<unknown> {
    const current = await this.client.request(path(input, input.id)); const plan = { domain: input.domain, itemtype: input.itemtype, id: input.id, purge: input.purge, current, reference_scan: { complete: false } };
    return { ...plan, preview_fingerprint: hash(plan), applicable: !input.purge, blocked_reasons: input.purge ? ['purge_requires_complete_reference_scan'] : [], modifies_data: false };
  }
  async delete(input: CatalogSelection & { id: number; purge: boolean; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown> {
    const preview = await this.previewDelete(input) as Record<string, unknown>; if (preview.preview_fingerprint !== input.previewFingerprint) throw new Error('Delete preview is stale');
    if (input.purge) throw new Error('Purge blocked: reference scan is incomplete');
    await this.client.request(path(input, input.id), { method: 'DELETE' }); return { success: true, operation: 'delete', before: preview.current, correlation_id: input.correlationId, verification_status: 'request_succeeded' };
  }
}
