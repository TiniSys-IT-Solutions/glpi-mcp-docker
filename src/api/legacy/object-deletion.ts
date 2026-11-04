import { createHash } from 'node:crypto';
import { DeletionApply, DeletionSelection, ObjectDeletionService, deletionApplySchema, deletionPreviewSchema } from '../../core/object-deletion/service.js';
import { GlpiClient } from './glpi-client.js';
import { GlpiError } from './http.js';
import { normalizeTaskJobTargets } from './inventory-plugin.js';

type Row = Record<string, unknown>;
type Reference = { type: string; fields?: string[]; polymorphic?: boolean; trash?: boolean; targets?: boolean };
const common: Reference[] = [{ type: 'Document_Item', polymorphic: true }, { type: 'Item_Ticket', polymorphic: true }];
const references: Record<DeletionSelection['itemtype'], Reference[]> = {
  Problem: [...common, { type: 'Problem_Ticket', fields: ['problems_id'] }, { type: 'Change_Problem', fields: ['problems_id'] }, { type: 'Problem_Problem', fields: ['problems_id_1', 'problems_id_2'] }, { type: 'Item_Problem', fields: ['problems_id'] }, { type: 'ProblemTask', fields: ['problems_id'] }, { type: 'ProblemCost', fields: ['problems_id'] }, { type: 'ITILFollowup', polymorphic: true }, { type: 'ITILSolution', polymorphic: true }, { type: 'Itil_Project', polymorphic: true }],
  Change: [...common, { type: 'Change_Ticket', fields: ['changes_id'] }, { type: 'Change_Problem', fields: ['changes_id'] }, { type: 'Change_Change', fields: ['changes_id_1', 'changes_id_2'] }, { type: 'Change_Item', fields: ['changes_id'] }, { type: 'ChangeTask', fields: ['changes_id'] }, { type: 'ChangeCost', fields: ['changes_id'] }, { type: 'ChangeValidation', fields: ['changes_id'] }, { type: 'ITILFollowup', polymorphic: true }, { type: 'ITILSolution', polymorphic: true }, { type: 'Itil_Project', polymorphic: true }],
  Project: [...common, { type: 'Project', fields: ['projects_id'], trash: true }, { type: 'ProjectTask', fields: ['projects_id'] }, { type: 'Item_Project', fields: ['projects_id'] }, { type: 'Itil_Project', fields: ['projects_id'] }, { type: 'ProjectCost', fields: ['projects_id'] }],
  IPNetwork: [{ type: 'IPNetwork', fields: ['ipnetworks_id'] }, { type: 'IPAddress_IPNetwork', fields: ['ipnetworks_id'] }, { type: 'IPNetwork_Vlan', fields: ['ipnetworks_id'] }, { type: 'NetworkName', fields: ['ipnetworks_id'], trash: true }],
  NetworkName: [{ type: 'IPAddress', polymorphic: true, trash: true }, { type: 'NetworkAlias', fields: ['networknames_id'] }],
  PluginGlpiinventoryIPRange: [{ type: 'PluginGlpiinventoryIPRange_SNMPCredential', fields: ['plugin_glpiinventory_ipranges_id'] }, { type: 'PluginGlpiinventoryTaskjob', targets: true }],
};
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function rawId(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) throw new Error('Reference ID is missing or expanded');
  return Number(value);
}
const deleted = (row: Row) => row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true;

export class LegacyObjectDeletionService implements ObjectDeletionService {
  constructor(private readonly client: GlpiClient) {}
  private async scan(ref: Reference, input: DeletionSelection): Promise<Row[]> {
    const matches = new Map<number, Row>();
    for (const isDeleted of ref.trash ? [false, true] : [false]) {
      let complete = false;
      for (let start = 0; start < 50000; start += 1000) {
        const page = await this.client.getItems<Row>(ref.type, { range: `${start}-${start + 999}`, expand_dropdowns: false, is_deleted: isDeleted, order: 'ASC' });
        if (!Array.isArray(page)) throw new Error('Invalid collection');
        for (const row of page) {
          const id = rawId(row.id);
          let match = false;
          if (ref.targets) match = normalizeTaskJobTargets(row.targets).some((target) => target.itemtype === input.itemtype && target.id === input.id);
          else if (ref.polymorphic) {
            if (typeof row.itemtype !== 'string') throw new Error('Missing polymorphic itemtype');
            match = rawId(row.items_id) === input.id && row.itemtype === input.itemtype;
          } else match = ref.fields!.map((field) => rawId(row[field])).some((id) => id === input.id);
          if (match) matches.set(id, row);
        }
        if (page.length < 1000) { complete = true; break; }
      }
      if (!complete) throw new Error('Reference scan safety cap reached');
    }
    return [...matches.values()].sort((a, b) => Number(a.id) - Number(b.id));
  }
  async preview(raw: DeletionSelection) {
    const input = deletionPreviewSchema.parse(raw);
    const current = await this.client.getItem<Row>(input.itemtype, input.id, { expand_dropdowns: false });
    if (rawId(current.id) !== input.id) throw new Error('Unexpected object ID');
    // GLPI 11 NetworkName/NetworkPort override useDeletedToLockIfDynamic to false:
    // their is_deleted field is native trash even for manually created objects.
    const permanent = ['IPNetwork', 'PluginGlpiinventoryIPRange'].includes(input.itemtype);
    const dependencies: Record<string, unknown[]> = {};
    const blocked: string[] = [];
    for (const ref of references[input.itemtype]) {
      try { dependencies[ref.type] = await this.scan(ref, input); }
      catch { blocked.push(`reference_scan_incomplete:${ref.type}`); }
    }
    for (const [type, rows] of Object.entries(dependencies)) if (rows.length) blocked.push(`unresolved_dependencies:${type}`);
    if (!permanent && ![0, 1, '0', '1', false, true].includes(current.is_deleted as never)) blocked.push('soft_delete_contract_missing');
    if ([1, '1', true].includes(current.is_template as never)) blocked.push('template_deletion_excluded');
    if (deleted(current)) blocked.push('already_in_trash');
    const plan = { ...input, current, dependencies, operation: permanent ? 'permanent_delete' : 'move_to_trash', recoverability: permanent ? 'not_recoverable' : 'trash', reference_scan: { complete: !blocked.some((v) => v.startsWith('reference_scan_incomplete')), scope: 'source_audited_relations_visible_to_current_GLPI_profile' }, blocked_reasons: blocked };
    return { ...plan, preview_fingerprint: hash(plan), applicable: blocked.length === 0, modifies_data: false,
      warnings: [permanent ? 'Permanent deletion; cannot be restored from trash.' : 'Object will be moved to trash; no purge.', 'GLPI permissions apply. Concurrent changes between final scan and DELETE cannot be locked by Legacy REST.'] };
  }
  async delete(raw: DeletionApply) {
    const input = deletionApplySchema.parse(raw);
    const preview = await this.preview({ itemtype: input.itemtype, id: input.id });
    if (preview.preview_fingerprint !== input.preview_fingerprint) throw new Error('Object deletion preview is stale');
    if (!preview.applicable) throw new Error(`Delete blocked: ${preview.blocked_reasons.join(', ')}`);
    const permanent = preview.operation === 'permanent_delete';
    const result = { itemtype: input.itemtype, id: input.id, operation: preview.operation, before: preview.current, correlation_id: input.correlation_id, retry_warning: 'do_not_retry_delete_blindly' };
    try { await this.client.deleteItem(input.itemtype, input.id, permanent); }
    catch { return { ...result, success: false, write_status: 'outcome_uncertain', verification_status: 'not_verified' }; }
    try {
      const after = await this.client.getItem<Row>(input.itemtype, input.id, { expand_dropdowns: false });
      const verified = !permanent && rawId(after.id) === input.id && deleted(after);
      return { ...result, success: verified, write_status: 'request_succeeded', verification_status: verified ? 'verified' : 'outcome_requires_review', after };
    } catch (error) {
      const absent = permanent && error instanceof GlpiError && error.status === 404 && error.glpiCode === 'ERROR_ITEM_NOT_FOUND';
      return { ...result, success: absent, write_status: 'request_succeeded', verification_status: absent ? 'verified' : 'outcome_requires_review' };
    }
  }
}
