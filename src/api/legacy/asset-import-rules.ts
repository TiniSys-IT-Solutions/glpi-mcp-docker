import { createHash } from 'node:crypto';
import { AssetImportRuleService } from '../../core/asset-import-rules/service.js';
import { AssetImportRuleListRequest, AssetImportRuleSnapshot, RestorePreviewRequest } from '../../core/asset-import-rules/types.js';
import { GlpiClient } from './glpi-client.js';

const PAGE_SIZE = 1000;
const MAX_RULES = 100000;
const CONDITION_LABELS: Record<number, string> = {
  0: 'is', 1: 'is_not', 2: 'contains', 3: 'does_not_contain', 4: 'starts_with', 5: 'ends_with',
  6: 'regex_matches', 7: 'regex_does_not_match', 8: 'exists', 9: 'does_not_exist', 10: 'under', 11: 'not_under',
};
const KNOWN_CRITERIA = new Set([
  'name', 'serial', 'otherserial', 'uuid', 'mac', 'ip', 'subnet', 'itemtype', 'manufacturer', 'model',
  'entities_id', 'locations_id', 'tag', 'domain', 'oscomment', '_source', 'sysdescr', 'sysobjectid',
]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== 'captured_at' && key !== 'fingerprint').sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function num(value: unknown, fallback = 0): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function text(value: unknown): string { return String(value ?? ''); }
function asRows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }
function ordered(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => num(a.ranking ?? a.id) - num(b.ranking ?? b.id) || num(a.id) - num(b.id));
}
function normalizeCriterion(row: Record<string, unknown>, index: number) {
  const criterion = text(row.criteria);
  const condition = num(row.condition);
  return { order: num(row.ranking, index), id: num(row.id), criterion, condition,
    condition_label: CONDITION_LABELS[condition] ?? `unknown_${condition}`, pattern: row.pattern ?? null,
    native: stable(row), warnings: KNOWN_CRITERIA.has(criterion) ? [] : [`unknown_criterion:${criterion || '<empty>'}`] };
}
function normalizeAction(row: Record<string, unknown>, index: number) {
  return { order: num(row.ranking, index), id: num(row.id), action_type: text(row.action_type), field: text(row.field),
    value: row.value ?? null, human_label: `${text(row.action_type) || 'action'} ${text(row.field) || '<unknown>'} = ${text(row.value)}`,
    native: stable(row) };
}

export class LegacyAssetImportRuleService implements AssetImportRuleService {
  constructor(private readonly client: GlpiClient) {}

  private async collection(path: string): Promise<Record<string, unknown>[]> {
    const result: Record<string, unknown>[] = [];
    for (let start = 0; start < MAX_RULES; start += PAGE_SIZE) {
      const { data } = await this.client.http.request<unknown[]>(path, { query: { range: `${start}-${start + PAGE_SIZE - 1}`, expand_dropdowns: 'false' } });
      const page = asRows(data); result.push(...page);
      if (page.length < PAGE_SIZE) return result;
    }
    throw new Error(`Safety cap reached while reading ${path}; refusing an incomplete audit`);
  }

  private async normalizedRule(rule: Record<string, unknown>, includeCriteria = true, includeActions = true) {
    const id = num(rule.id);
    if (!id || text(rule.sub_type) !== 'RuleImportAsset') throw new Error(`Rule ${id || '<unknown>'} is not RuleImportAsset`);
    const [criteriaRows, actionRows] = await Promise.all([
      includeCriteria ? this.collection(`RuleImportAsset/${id}/RuleCriteria`) : Promise.resolve([]),
      includeActions ? this.collection(`RuleImportAsset/${id}/RuleAction`) : Promise.resolve([]),
    ]);
    const criteria = ordered(criteriaRows).map(normalizeCriterion);
    const actions = ordered(actionRows).map(normalizeAction);
    return { id, name: text(rule.name), ranking: num(rule.ranking), is_active: num(rule.is_active) === 1,
      match_operator: text(rule.match || 'AND'), sub_type: text(rule.sub_type),
      entity_scope: num(rule.entities_id), recursive: num(rule.is_recursive) === 1,
      description: text(rule.description), comment: text(rule.comment), date_creation: rule.date_creation ?? null, date_mod: rule.date_mod ?? null,
      criteria, actions, native: stable(rule), warnings: criteria.flatMap((criterion) => criterion.warnings) };
  }

  async list(input: AssetImportRuleListRequest): Promise<unknown> {
    const rows = ordered(await this.collection('RuleImportAsset'));
    const rules = [];
    for (const row of rows) {
      if (text(row.sub_type) !== 'RuleImportAsset') continue;
      if (input.activeOnly && num(row.is_active) !== 1) continue;
      const normalized = await this.normalizedRule(row, input.includeCriteria, input.includeActions);
      if (input.itemtypeFilter && !normalized.criteria.some((criterion) => criterion.criterion === 'itemtype' && text(criterion.pattern) === input.itemtypeFilter)) continue;
      rules.push(normalized);
    }
    const selected = input.fetchAll ? rules : rules.slice(input.start, input.start + input.limit);
    return { rules: selected, total: rules.length, pagination: { start: input.fetchAll ? 0 : input.start, limit: input.fetchAll ? rules.length : input.limit, returned: selected.length }, complete: input.fetchAll || input.start + selected.length >= rules.length, modifies_data: false };
  }

  async get(id: number): Promise<unknown> {
    const rule = await this.client.getItem<Record<string, unknown>>('RuleImportAsset', id, { expand_dropdowns: false });
    return this.normalizedRule(rule, true, true);
  }

  async exportSnapshot(input: AssetImportRuleListRequest): Promise<unknown> {
    const listed = await this.list({ ...input, includeCriteria: true, includeActions: true, fetchAll: true, start: 0, limit: MAX_RULES }) as { rules: Record<string, unknown>[] };
    const body = { schema_version: 1 as const, source: { glpi_version: null, api_mode: 'legacy' as const }, rules: listed.rules };
    return { ...body, fingerprint: hash(body), captured_at: new Date().toISOString(), fingerprint_scope: 'all fields except captured_at and fingerprint', modifies_data: false };
  }

  async diffSnapshots(before: AssetImportRuleSnapshot, after: AssetImportRuleSnapshot): Promise<unknown> {
    this.assertSnapshot(before); this.assertSnapshot(after);
    const left = new Map(before.rules.map((rule) => [num(rule.id), rule]));
    const right = new Map(after.rules.map((rule) => [num(rule.id), rule]));
    const added = [...right.keys()].filter((id) => !left.has(id));
    const removed = [...left.keys()].filter((id) => !right.has(id));
    const modified: Record<string, unknown>[] = []; const moved: number[] = []; const activation: number[] = [];
    for (const [id, next] of right) {
      const previous = left.get(id); if (!previous) continue;
      if (hash(previous) !== hash(next)) modified.push({ id, before_fingerprint: hash(previous), after_fingerprint: hash(next),
        criteria_changed: hash(previous.criteria) !== hash(next.criteria), actions_changed: hash(previous.actions) !== hash(next.actions) });
      if (num(previous.ranking) !== num(next.ranking)) moved.push(id);
      if (Boolean(previous.is_active) !== Boolean(next.is_active)) activation.push(id);
    }
    return { added, removed, modified, moved, activation_changed: activation,
      risks: [removed.length ? 'rules_removed' : '', moved.length ? 'evaluation_order_changed' : '', activation.length ? 'activation_changed' : ''].filter(Boolean), modifies_data: false };
  }

  async previewRestore(input: RestorePreviewRequest): Promise<unknown> {
    this.assertSnapshot(input.snapshot);
    const current = await this.exportSnapshot({ includeCriteria: true, includeActions: true, fetchAll: true, start: 0, limit: MAX_RULES }) as AssetImportRuleSnapshot;
    const diff = await this.diffSnapshots(current, input.snapshot) as Record<string, unknown>;
    const blocked: string[] = [];
    if ((diff.added as unknown[]).length && !input.allowCreate) blocked.push('create_not_allowed');
    if ((diff.modified as unknown[]).length && !input.allowUpdate) blocked.push('update_not_allowed');
    if ((diff.removed as unknown[]).length && !input.allowDelete && input.restoreMode === 'exact') blocked.push('delete_not_allowed');
    const planBody = { restore_mode: input.restoreMode, source_fingerprint: input.snapshot.fingerprint, current_fingerprint: current.fingerprint,
      permissions: { create: input.allowCreate, update: input.allowUpdate, disable: input.allowDisable, delete: input.allowDelete }, diff, blocked };
    return { ...planBody, preview_fingerprint: hash(planBody), applicable: blocked.length === 0, modifies_data: false };
  }

  async applyRestore(input: RestorePreviewRequest & { previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown> {
    const preview = await this.previewRestore(input) as Record<string, unknown>;
    if (preview.preview_fingerprint !== input.previewFingerprint) throw new Error('Preview is stale: RuleImportAsset configuration changed');
    return { success: false, status: 'not_supported', correlation_id: input.correlationId, preview_fingerprint: input.previewFingerprint,
      explanation: 'Exact RuleImportAsset restoration is blocked until the GLPI 11 child ordering/deletion contract is confirmed. No write was attempted.', modifies_data: false };
  }

  async simulate(input: { unmanagedIds?: number[]; inventoryPayload?: Record<string, unknown>; snapshot?: AssetImportRuleSnapshot; stopAtFirstMatch: boolean }): Promise<unknown> {
    const snapshot = input.snapshot ?? await this.exportSnapshot({ includeCriteria: true, includeActions: true, fetchAll: true, start: 0, limit: MAX_RULES }) as AssetImportRuleSnapshot;
    this.assertSnapshot(snapshot);
    return { status: 'not_supported', evaluated_snapshot_fingerprint: snapshot.fingerprint, requested_unmanaged_ids: input.unmanagedIds ?? [],
      explanation: 'GLPI RuleImportAsset evaluation semantics and plugin-enriched inventory payload are not fully exposed by the REST API; the MCP refuses to invent a result.', modifies_data: false };
  }

  async analyzeRisks(snapshot?: AssetImportRuleSnapshot): Promise<unknown> {
    const source = snapshot ?? await this.exportSnapshot({ includeCriteria: true, includeActions: true, fetchAll: true, start: 0, limit: MAX_RULES }) as AssetImportRuleSnapshot;
    this.assertSnapshot(source);
    const risks: Record<string, unknown>[] = [];
    const ranks = new Map<number, number[]>();
    for (const rule of source.rules) {
      const id = num(rule.id); const ranking = num(rule.ranking); const criteria = asRows(rule.criteria); const actions = asRows(rule.actions);
      ranks.set(ranking, [...(ranks.get(ranking) ?? []), id]);
      if (Boolean(rule.is_active) && actions.some((action) => text(action.field).includes('import')) && !actions.some((action) => text(action.field).includes('link'))) risks.push({ rule_id: id, risk: 'import_without_coherent_update_action' });
      if (!criteria.length) risks.push({ rule_id: id, risk: 'active_or_reachable_rule_without_criteria' });
      if (criteria.some((criterion) => criterion.criterion === 'mac' && /\*|\.\*/.test(text(criterion.pattern)))) risks.push({ rule_id: id, risk: 'permissive_mac_rule_may_accept_virtual_or_multicast' });
      if (criteria.some((criterion) => criterion.criterion === 'name' && /\*|\.\*/.test(text(criterion.pattern)))) risks.push({ rule_id: id, risk: 'overly_permissive_name_rule' });
    }
    for (const [ranking, ids] of ranks) if (ids.length > 1) risks.push({ risk: 'duplicate_ranking', ranking, rule_ids: ids });
    return { snapshot_fingerprint: source.fingerprint, risks, risk_count: risks.length, limitations: ['static_analysis_only', 'no_inventory_payload_evaluation'], modifies_data: false };
  }

  async guardedMutation(operation: string, input: Record<string, unknown>): Promise<unknown> {
    return { success: false, status: 'not_supported', operation, requested_ids: [input.rule_id, input.criterion_id, input.action_id].filter(Boolean),
      explanation: 'This RuleImportAsset mutation is not enabled until its exact GLPI 11 REST behavior and post-write ordering verification are covered by fixtures. No write was attempted.', modifies_data: false };
  }

  private assertSnapshot(snapshot: AssetImportRuleSnapshot): void {
    const expected = hash({ schema_version: snapshot.schema_version, source: snapshot.source, rules: snapshot.rules });
    if (expected !== snapshot.fingerprint) throw new Error('Snapshot fingerprint is invalid');
    if (snapshot.rules.some((rule) => text(rule.sub_type) !== 'RuleImportAsset')) throw new Error('Snapshot contains a non-RuleImportAsset rule');
  }
}
