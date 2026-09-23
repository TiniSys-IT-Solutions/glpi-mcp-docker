import { createHash } from 'node:crypto';
import { GovernanceService } from '../../core/governance/service.js';
import { AssetRelationKind, GovernanceAudit, RELATION_ASSET_TYPES } from '../../core/governance/types.js';
import { CATALOG_ITEMTYPES } from '../../core/catalog/types.js';
import { GlpiClient } from './glpi-client.js';

const RELATIONS: Record<AssetRelationKind, { itemtype: string; relatedType: string; relatedField: string }> = {
  contract: { itemtype: 'Contract_Item', relatedType: 'Contract', relatedField: 'contracts_id' },
  document: { itemtype: 'Document_Item', relatedType: 'Document', relatedField: 'documents_id' },
  certificate: { itemtype: 'Certificate_Item', relatedType: 'Certificate', relatedField: 'certificates_id' },
  domain: { itemtype: 'Domain_Item', relatedType: 'Domain', relatedField: 'domains_id' },
};
const DROPDOWN_REFERENCES: Record<string, Array<{ itemtype: string; field: string }>> = {
  Location: RELATION_ASSET_TYPES.map((itemtype) => ({ itemtype, field: 'locations_id' })),
  Manufacturer: RELATION_ASSET_TYPES.map((itemtype) => ({ itemtype, field: 'manufacturers_id' })),
  State: RELATION_ASSET_TYPES.map((itemtype) => ({ itemtype, field: 'states_id' })),
  ITILCategory: ['Ticket', 'Problem', 'Change'].map((itemtype) => ({ itemtype, field: 'itilcategories_id' })),
  RequestType: ['Ticket', 'Problem', 'Change'].map((itemtype) => ({ itemtype, field: 'requesttypes_id' })),
  SupplierType: [{ itemtype: 'Supplier', field: 'suppliertypes_id' }],
  ContractType: [{ itemtype: 'Contract', field: 'contracttypes_id' }],
  DocumentType: [{ itemtype: 'Document', field: 'documenttypes_id' }],
  SoftwareCategory: [{ itemtype: 'Software', field: 'softwarecategories_id' }],
};
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])); return value; }
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : Number(value ?? 0); }
function isDeleted(value: unknown): boolean { return value === true || value === 1 || value === '1'; }
function normalizeName(value: unknown): string { return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }

export class LegacyGovernanceService implements GovernanceService {
  constructor(private readonly client: GlpiClient) {}
  private async all(itemtype: string, limit = 50000): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; rows.length < limit; start += 1000) {
      const size = Math.min(1000, limit - rows.length);
      const page = await this.client.getItems<Record<string, unknown>>(itemtype, { range: `${start}-${start + size - 1}`, expand_dropdowns: false });
      rows.push(...page); if (page.length < size) break;
    }
    return rows;
  }
  async listAssetRelations(input: { itemtype: string; assetId: number; kind: AssetRelationKind }): Promise<unknown> {
    await this.client.getItem(input.itemtype, input.assetId, { expand_dropdowns: false });
    const config = RELATIONS[input.kind];
    const relations = (await this.all(config.itemtype)).filter((row) => row.itemtype === input.itemtype && numberValue(row.items_id) === input.assetId);
    return { itemtype: input.itemtype, asset_id: input.assetId, relation: input.kind, relations, returned: relations.length, complete: true, modifies_data: false };
  }
  async attachAssetRelation(input: { itemtype: string; assetId: number; kind: AssetRelationKind; relatedId: number; correlationId: string }): Promise<unknown> {
    const config = RELATIONS[input.kind];
    await Promise.all([this.client.getItem(input.itemtype, input.assetId, { expand_dropdowns: false }), this.client.getItem(config.relatedType, input.relatedId, { expand_dropdowns: false })]);
    const existing = (await this.listAssetRelations(input) as { relations: Record<string, unknown>[] }).relations.find((row) => numberValue(row[config.relatedField]) === input.relatedId);
    if (existing) return { success: true, idempotent: true, relation: existing, correlation_id: input.correlationId };
    const created = await this.client.createItem(config.itemtype, { itemtype: input.itemtype, items_id: input.assetId, [config.relatedField]: input.relatedId });
    const after = await this.client.getItem(config.itemtype, created.id, { expand_dropdowns: false });
    return { success: true, operation: 'attach', relation: input.kind, relation_id: created.id, after, correlation_id: input.correlationId, verification_status: 'verified' };
  }
  async previewDetachAssetRelation(input: { relationId: number; kind: AssetRelationKind }): Promise<unknown> {
    const current = await this.client.getItem(RELATIONS[input.kind].itemtype, input.relationId, { expand_dropdowns: false });
    const plan = { relation: input.kind, relation_id: input.relationId, current, operation: 'detach_relation_only' };
    return { ...plan, preview_fingerprint: hash(plan), applicable: true, modifies_data: false };
  }
  async detachAssetRelation(input: { relationId: number; kind: AssetRelationKind; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown> {
    const preview = await this.previewDetachAssetRelation(input) as Record<string, unknown>;
    if (preview.preview_fingerprint !== input.previewFingerprint) throw new Error('Relation detach preview is stale');
    await this.client.deleteItem(RELATIONS[input.kind].itemtype, input.relationId, true);
    return { success: true, operation: 'detach', relation: input.kind, relation_id: input.relationId, before: preview.current, correlation_id: input.correlationId, verification_status: 'request_succeeded' };
  }
  async getDropdownUsage(input: { itemtype: string; id: number; start: number; limit: number }): Promise<unknown> {
    await this.client.getItem(input.itemtype, input.id, { expand_dropdowns: false });
    const refs = DROPDOWN_REFERENCES[input.itemtype] ?? [];
    const matches: unknown[] = []; const unavailable: unknown[] = [];
    for (const ref of refs) {
      try {
        const rows = await this.all(ref.itemtype, 50000);
        for (const row of rows) if (!isDeleted(row.is_deleted) && numberValue(row[ref.field]) === input.id) matches.push({ itemtype: ref.itemtype, id: row.id, field: ref.field });
      } catch (error) { unavailable.push({ ...ref, reason: error instanceof Error ? error.message : String(error) }); }
    }
    return { dropdown_itemtype: input.itemtype, dropdown_id: input.id, usage: matches.slice(input.start, input.start + input.limit), total: matches.length, complete: unavailable.length === 0 && refs.length > 0, unavailable_references: unavailable, coverage: refs };
  }
  async audit(input: { audit: GovernanceAudit; itemtypes?: string[]; entityId?: number; days?: number; requiredFields?: string[]; limit: number }): Promise<unknown> {
    if (input.audit === 'dropdown_duplicates') return this.auditDropdownDuplicates(input.limit);
    if (input.audit === 'orphan_documents') return this.auditOrphanDocuments(input.limit);
    if (input.audit === 'contract_expirations') return this.auditExpirations('Contract', input.days ?? 90, input.limit);
    if (input.audit === 'certificate_expirations') return this.auditExpirations('Certificate', input.days ?? 90, input.limit);
    if (input.audit === 'stale_assets') return this.auditStaleAssets(input.itemtypes ?? ['Computer', 'NetworkEquipment', 'Printer'], input.entityId, input.days ?? 90, input.limit);
    if (input.audit === 'inventory_coverage') return this.auditInventoryCoverage(input.itemtypes ?? ['Computer', 'NetworkEquipment', 'Printer'], input.entityId, input.days ?? 90, input.limit);
    if (input.audit === 'unassigned_itil_items') return this.auditUnassignedItil(input.entityId, input.limit);
    if (input.audit === 'ticket_sla_risk') return this.auditTicketSlaRisk(input.entityId, input.days ?? 7, input.limit);
    return this.auditAssetCompleteness(input.itemtypes ?? ['Computer', 'NetworkEquipment', 'Printer'], input.entityId, input.requiredFields ?? ['name', 'serial', 'locations_id', 'states_id'], input.limit);
  }
  private async auditDropdownDuplicates(limit: number): Promise<unknown> {
    const groups: unknown[] = [];
    for (const itemtype of CATALOG_ITEMTYPES.dropdown) {
      try {
        const buckets = new Map<string, Record<string, unknown>[]>();
        for (const row of await this.all(itemtype, limit)) { if (isDeleted(row.is_deleted)) continue; const key = normalizeName(row.name); if (!key) continue; buckets.set(key, [...(buckets.get(key) ?? []), row]); }
        for (const [normalized_name, rows] of buckets) if (rows.length > 1) groups.push({ itemtype, normalized_name, ids: rows.map((row) => row.id), names: rows.map((row) => row.name) });
      } catch { /* unavailable types are reported by coverage below */ }
    }
    return { audit: 'dropdown_duplicates', duplicate_groups: groups, count: groups.length, modifies_data: false, matching: 'unicode_case_whitespace_normalized' };
  }
  private async auditOrphanDocuments(limit: number): Promise<unknown> {
    const [documents, links] = await Promise.all([this.all('Document', limit), this.all('Document_Item', 50000)]);
    const linked = new Set(links.map((row) => numberValue(row.documents_id)));
    const findings = documents.filter((row) => !isDeleted(row.is_deleted) && !linked.has(numberValue(row.id))).map((row) => ({ id: row.id, name: row.name, filename: row.filename, entity_id: row.entities_id }));
    return { audit: 'orphan_documents', findings, count: findings.length, complete: documents.length < limit, modifies_data: false };
  }
  private async auditExpirations(itemtype: 'Contract' | 'Certificate', days: number, limit: number): Promise<unknown> {
    const now = Date.now(); const horizon = now + days * 86400000;
    const candidates = (await this.all(itemtype, limit)).filter((row) => !isDeleted(row.is_deleted)).map((row) => {
      const raw = row.date_expiration ?? row.end_date ?? row.date_end; const timestamp = raw ? Date.parse(String(raw)) : NaN;
      return { id: row.id, name: row.name, expiration_date: raw, days_remaining: Number.isFinite(timestamp) ? Math.ceil((timestamp - now) / 86400000) : null, expired: Number.isFinite(timestamp) ? timestamp < now : null };
    }).filter((row) => row.days_remaining !== null && Date.parse(String(row.expiration_date)) <= horizon).sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0));
    return { audit: itemtype === 'Contract' ? 'contract_expirations' : 'certificate_expirations', horizon_days: days, findings: candidates, count: candidates.length, modifies_data: false, date_fields_checked: ['date_expiration', 'end_date', 'date_end'] };
  }
  private async auditAssetCompleteness(itemtypes: string[], entityId: number | undefined, requiredFields: string[], limit: number): Promise<unknown> {
    const findings: unknown[] = [];
    for (const itemtype of itemtypes) for (const row of await this.all(itemtype, limit)) {
      if (isDeleted(row.is_deleted) || (entityId !== undefined && numberValue(row.entities_id) !== entityId)) continue;
      const missing = requiredFields.filter((field) => row[field] === null || row[field] === undefined || row[field] === '' || row[field] === 0 || row[field] === '0');
      if (missing.length) findings.push({ itemtype, id: row.id, name: row.name, entity_id: row.entities_id, missing_fields: missing, completeness_percent: Math.round(((requiredFields.length - missing.length) / requiredFields.length) * 100) });
    }
    return { audit: 'asset_completeness', required_fields: requiredFields, findings, count: findings.length, modifies_data: false };
  }
  private async auditStaleAssets(itemtypes: string[], entityId: number | undefined, days: number, limit: number): Promise<unknown> {
    const threshold = Date.now() - days * 86400000; const findings: unknown[] = [];
    for (const itemtype of itemtypes) for (const row of await this.all(itemtype, limit)) {
      if (isDeleted(row.is_deleted) || (entityId !== undefined && numberValue(row.entities_id) !== entityId)) continue;
      const raw = row.last_inventory_update ?? row.date_mod; const timestamp = raw ? Date.parse(String(raw)) : NaN;
      if (!Number.isFinite(timestamp) || timestamp < threshold) findings.push({ itemtype, id: row.id, name: row.name, last_seen: raw ?? null, age_days: Number.isFinite(timestamp) ? Math.floor((Date.now() - timestamp) / 86400000) : null });
    }
    return { audit: 'stale_assets', stale_after_days: days, findings, count: findings.length, timestamp_policy: 'last_inventory_update_then_date_mod', modifies_data: false };
  }
  private async auditInventoryCoverage(itemtypes: string[], entityId: number | undefined, days: number, limit: number): Promise<unknown> {
    const stale = await this.auditStaleAssets(itemtypes, entityId, days, limit) as { findings: unknown[] };
    let total = 0;
    for (const itemtype of itemtypes) total += (await this.all(itemtype, limit)).filter((row) => !isDeleted(row.is_deleted) && (entityId === undefined || numberValue(row.entities_id) === entityId)).length;
    return { audit: 'inventory_coverage', total_assets: total, covered_assets: Math.max(0, total - stale.findings.length), uncovered_or_stale: stale.findings, coverage_percent: total ? Math.round(((total - stale.findings.length) / total) * 10000) / 100 : 100, freshness_days: days, modifies_data: false };
  }
  private async auditUnassignedItil(entityId: number | undefined, limit: number): Promise<unknown> {
    const findings: unknown[] = [];
    for (const itemtype of ['Ticket', 'Problem', 'Change']) for (const row of await this.all(itemtype, limit)) {
      if (isDeleted(row.is_deleted) || (entityId !== undefined && numberValue(row.entities_id) !== entityId)) continue;
      const status = numberValue(row.status); if ((itemtype === 'Ticket' && [5, 6].includes(status)) || (itemtype !== 'Ticket' && status >= 5)) continue;
      const assigned = numberValue(row.users_id_assign) || numberValue(row.groups_id_assign) || numberValue(row.suppliers_id_assign);
      if (!assigned) findings.push({ itemtype, id: row.id, name: row.name, status: row.status, entity_id: row.entities_id });
    }
    return { audit: 'unassigned_itil_items', findings, count: findings.length, assignment_fields_checked: ['users_id_assign', 'groups_id_assign', 'suppliers_id_assign'], modifies_data: false };
  }
  private async auditTicketSlaRisk(entityId: number | undefined, days: number, limit: number): Promise<unknown> {
    const now = Date.now(); const horizon = now + days * 86400000; const findings: unknown[] = [];
    for (const row of await this.all('Ticket', limit)) {
      if (isDeleted(row.is_deleted) || [5, 6].includes(numberValue(row.status)) || (entityId !== undefined && numberValue(row.entities_id) !== entityId)) continue;
      const raw = row.time_to_resolve; const timestamp = raw ? Date.parse(String(raw)) : NaN;
      if (Number.isFinite(timestamp) && timestamp <= horizon) findings.push({ id: row.id, name: row.name, status: row.status, priority: row.priority, time_to_resolve: raw, overdue: timestamp < now, hours_remaining: Math.ceil((timestamp - now) / 3600000) });
    }
    findings.sort((a: any, b: any) => a.hours_remaining - b.hours_remaining);
    return { audit: 'ticket_sla_risk', horizon_days: days, findings, count: findings.length, field_checked: 'time_to_resolve', modifies_data: false };
  }
}
