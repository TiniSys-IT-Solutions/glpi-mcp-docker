import { PrinterService } from '../../core/assets/service.js';
import { AppendPrinterCommentRequest, PrinterUpdateRequest, ReassignPrintersRequest } from '../../core/assets/types.js';
import { cidrContainsIPv4, selectPrinterBusinessIP } from '../../core/assets/printer-utils.js';
import { resolveGlpiRelationId } from '../../core/glpi-relations.js';
import { GlpiClient } from './glpi-client.js';

const REFERENCE_TYPES: Array<[keyof PrinterUpdateRequest, string]> = [
  ['entityId', 'Entity'], ['locationId', 'Location'], ['stateId', 'State'],
  ['manufacturerId', 'Manufacturer'], ['modelId', 'PrinterModel'],
  ['printerTypeId', 'PrinterType'], ['networkId', 'Network'],
  ['assignedUserId', 'User'], ['assignedTechnicianId', 'User'],
];

export function legacyPrinterUpdatePayload(input: PrinterUpdateRequest): Record<string, unknown> {
  const clear = (value: string | null | undefined) => value === null ? '' : value;
  return Object.fromEntries(Object.entries({
    entities_id: input.entityId,
    locations_id: input.locationId,
    name: input.name,
    serial: clear(input.serial),
    otherserial: clear(input.inventoryNumber),
    comment: clear(input.comment),
    states_id: input.stateId,
    manufacturers_id: input.manufacturerId,
    printermodels_id: input.modelId,
    printertypes_id: input.printerTypeId,
    networks_id: input.networkId,
    users_id: input.assignedUserId,
    users_id_tech: input.assignedTechnicianId,
    contact: clear(input.contact),
    contact_num: clear(input.contactNumber),
    memory_size: input.memorySize,
    is_recursive: input.recursive === undefined ? undefined : input.recursive ? 1 : 0,
    is_global: input.global === undefined ? undefined : input.global ? 1 : 0,
  }).filter(([, value]) => value !== undefined));
}

function comparable(value: unknown): unknown {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

export class LegacyPrinterService implements PrinterService {
  constructor(private readonly client: GlpiClient) {}

  async update(id: number, input: PrinterUpdateRequest): Promise<unknown> {
    const payload = legacyPrinterUpdatePayload(input);
    if (Object.keys(payload).length === 0) throw new Error('At least one printer field must be provided');
    const before = await this.client.getItem<Record<string, unknown>>('Printer', id);
    await this.validateReferences(input, before);
    await this.client.updateItem('Printer', id, payload);
    let after: Record<string, unknown>;
    try {
      after = await this.client.getItem<Record<string, unknown>>('Printer', id);
    } catch (error) {
      return {
        success: true, id, update_status: 'succeeded', verification_status: 'failed', before,
        requested: input, verification_error: error instanceof Error ? error.name : 'UnknownError',
        verification_message: error instanceof Error ? error.message : String(error),
      };
    }
    for (const [field, expected] of Object.entries(payload)) {
      if (comparable(after[field]) !== comparable(expected)) {
        throw new Error(`Printer ${id} verification failed for ${field}: expected ${String(expected)}, got ${String(after[field])}`);
      }
    }
    return { success: true, id, update_status: 'succeeded', verification_status: 'verified', before, requested: input, after };
  }

  async appendComment(printerId: number, input: AppendPrinterCommentRequest): Promise<unknown> {
    const before = await this.client.getItem<Record<string, unknown>>('Printer', printerId);
    const current = typeof before.comment === 'string' ? before.comment : '';
    if (current.includes(input.text)) {
      return { success: true, printer_id: printerId, appended: false, already_present: true, comment: current };
    }
    const next = current.length === 0 ? input.text : `${current}${input.separator ?? '\n'}${input.text}`;
    await this.client.updateItem('Printer', printerId, { comment: next });
    const after = await this.client.getItem<Record<string, unknown>>('Printer', printerId);
    if (after.comment !== next) throw new Error(`Printer ${printerId} comment verification failed`);
    return { success: true, printer_id: printerId, appended: true, already_present: false, comment: after.comment };
  }

  async reassignFromImportEntityRules(input: ReassignPrintersRequest): Promise<unknown> {
    if (!input.dryRun && input.confirmation !== 'I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN') {
      throw new Error('Live reassignment requires confirmation I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN');
    }
    const printers = input.printerIds
      ? await Promise.all(input.printerIds.map((id) => this.client.getItem<Record<string, unknown>>('Printer', id)))
      : await this.client.getItems<Record<string, unknown>>('Printer', { range: '0-9999' });
    const rules = await this.loadRules();
    const plans: Record<string, unknown>[] = [];
    for (const printer of printers) {
      try {
        plans.push(await this.planPrinter(printer, rules, input));
      } catch (error) {
        plans.push({ id: printer.id, name: printer.name, status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }
    const results: Record<string, unknown>[] = [];
    for (const plan of plans) {
      if (input.dryRun || plan.status !== 'ready') {
        results.push(this.publicPlan(plan));
        continue;
      }
      try {
        const fresh = await this.client.getItem<Record<string, unknown>>('Printer', Number(plan.id));
        const freshEntity = this.optionalRelationId(fresh, 'entities_id', 'Entity');
        const freshLocation = this.optionalRelationId(fresh, 'locations_id', 'Location');
        const freshComment = typeof fresh.comment === 'string' ? fresh.comment : '';
        const snapshot = plan._snapshot as Record<string, unknown>;
        if (freshEntity !== snapshot.entity_id || freshLocation !== snapshot.location_id || freshComment !== snapshot.comment) {
          results.push(this.publicPlan({ ...plan, status: 'concurrent_change',
            concurrent_state: { entity_id: freshEntity, location_id: freshLocation, comment: freshComment } }));
          continue;
        }
        const update: PrinterUpdateRequest = {
          entityId: Number(plan.target_entity_id), locationId: Number(plan.target_location_id),
        };
        if (typeof plan.comment_to_append === 'string') {
          update.comment = freshComment.includes(plan.comment_to_append)
            ? freshComment
            : freshComment.length === 0 ? plan.comment_to_append : `${freshComment}\n${plan.comment_to_append}`;
        }
        const changed = await this.update(Number(plan.id), update) as Record<string, unknown>;
        if (changed.verification_status !== 'verified') {
          results.push(this.publicPlan({ ...plan, status: 'error', error: 'post-write verification failed', verification: changed }));
          continue;
        }
        results.push(this.publicPlan({ ...plan, status: 'updated', verification: changed }));
      } catch (error) {
        results.push(this.publicPlan({ ...plan, status: 'error', error: error instanceof Error ? error.message : String(error) }));
      }
    }
    return {
      dry_run: input.dryRun,
      analyzed: results.length,
      ready: results.filter((item) => item.status === 'ready').length,
      already_correct: results.filter((item) => item.status === 'already_correct').length,
      updated: results.filter((item) => item.status === 'updated').length,
      ambiguous: results.filter((item) => ['ambiguous_ip', 'multiple_matching_rules'].includes(String(item.status))).length,
      invalid_target: results.filter((item) => item.status === 'invalid_target').length,
      no_matching_rule: results.filter((item) => item.status === 'no_matching_rule').length,
      skipped: results.filter((item) => !['ready', 'updated', 'already_correct', 'error'].includes(String(item.status))).length,
      errors: results.filter((item) => item.status === 'error').length,
      warnings: results.reduce((count, item) => count + (Array.isArray(item.warnings) ? item.warnings.length : 0), 0),
      results,
    };
  }

  private async validateReferences(input: PrinterUpdateRequest, before: Record<string, unknown>): Promise<void> {
    for (const [key, itemtype] of REFERENCE_TYPES) {
      const value = input[key];
      if (typeof value === 'number' && (value > 0 || itemtype === 'Entity')) {
        await this.client.getItem(itemtype, value);
      }
    }
    const entityId = input.entityId ?? this.optionalRelationId(before, 'entities_id', 'Entity');
    const locationId = input.locationId ?? this.optionalRelationId(before, 'locations_id', 'Location');
    if (locationId > 0) await this.assertLocationCompatible(locationId, entityId);
  }

  private async assertLocationCompatible(locationId: number, entityId: number): Promise<void> {
    const location = await this.client.getItem<Record<string, unknown>>('Location', locationId);
    const locationEntity = resolveGlpiRelationId(location, 'entities_id', 'Entity');
    if (locationEntity === entityId) return;
    if (!Boolean(Number(location.is_recursive ?? 0)) || !await this.isDescendantEntity(entityId, locationEntity)) {
      throw new Error(`Location ${locationId} belongs to entity ${locationEntity} and is not recursively available to entity ${entityId}`);
    }
  }

  private async isDescendantEntity(entityId: number, ancestorId: number): Promise<boolean> {
    let current = entityId;
    const visited = new Set<number>();
    while (!visited.has(current)) {
      if (current === ancestorId) return true;
      if (current === 0) return ancestorId === 0;
      visited.add(current);
      const entity = await this.client.getItem<Record<string, unknown>>('Entity', current);
      current = resolveGlpiRelationId(entity, 'entities_id', 'Entity');
    }
    return false;
  }

  private async printerIPs(printerId: number): Promise<string[]> {
    const ports = await this.subItems(`Printer/${printerId}/NetworkPort`);
    const ips: string[] = [];
    for (const port of ports) {
      const names = await this.subItems(`NetworkPort/${Number(port.id)}/NetworkName`);
      for (const name of names) {
        const addresses = await this.subItems(`NetworkName/${Number(name.id)}/IPAddress`);
        for (const address of addresses) if (typeof address.name === 'string') ips.push(address.name);
      }
    }
    return ips;
  }

  private async subItems(path: string): Promise<Record<string, unknown>[]> {
    const { data } = await this.client.http.request<unknown[]>(path);
    return Array.isArray(data) ? data as Record<string, unknown>[] : [];
  }

  private async loadRules(): Promise<Record<string, unknown>[]> {
    const rules = await this.client.getItems<Record<string, unknown>>('RuleImportEntity', { range: '0-9999' });
    return Promise.all(rules.map(async (rule) => ({
      ...rule,
      criteria: await this.subItems(`RuleImportEntity/${Number(rule.id)}/RuleCriteria`),
      actions: await this.subItems(`RuleImportEntity/${Number(rule.id)}/RuleAction`),
    })));
  }

  private async planPrinter(printer: Record<string, unknown>, rules: Record<string, unknown>[], input: ReassignPrintersRequest): Promise<Record<string, unknown>> {
    const selected = selectPrinterBusinessIP(await this.printerIPs(Number(printer.id)));
    const currentEntity = this.optionalRelationId(printer, 'entities_id', 'Entity');
    const currentLocation = this.optionalRelationId(printer, 'locations_id', 'Location');
    const currentComment = typeof printer.comment === 'string' ? printer.comment : '';
    const base = { id: printer.id, name: printer.name, current_entity_id: currentEntity, current_location_id: currentLocation,
      _snapshot: { entity_id: currentEntity, location_id: currentLocation, comment: currentComment } };
    if (selected.status !== 'ok') return { ...base, status: selected.status === 'ambiguous_ip' ? 'ambiguous_ip' : 'no_matching_rule', ip_candidates: selected.candidates };
    const matching = rules.filter((rule) => (rule.criteria as Record<string, unknown>[]).some((criterion) =>
      ['ip', 'subnet'].includes(String(criterion.criteria)) && Number(criterion.condition) === 333 &&
      cidrContainsIPv4(String(criterion.pattern), selected.ip)
    ));
    if (matching.length === 0) return { ...base, primary_ip: selected.ip, status: 'no_matching_rule' };
    const active = matching.filter((rule) => Boolean(Number(rule.is_active ?? 0)));
    if (active.length === 0) return { ...base, primary_ip: selected.ip, matching_rule_ids: matching.map((rule) => rule.id), status: 'rule_inactive' };
    const destinations = active.map((rule) => this.ruleDestination(rule));
    if (destinations.some((destination) => 'error' in destination)) {
      return { ...base, primary_ip: selected.ip, matching_rule_ids: active.map((rule) => rule.id), status: 'invalid_rule_actions', destinations };
    }
    const normalized = destinations as Array<{ rule: Record<string, unknown>; entityId: number; locationId: number }>;
    const destinationKeys = new Set(normalized.map((destination) => `${destination.entityId}:${destination.locationId}`));
    if (destinationKeys.size > 1) {
      return { ...base, primary_ip: selected.ip, status: 'multiple_matching_rules',
        matching_rule_ids: active.map((rule) => rule.id), destinations: normalized.map((destination) => ({
          rule_id: destination.rule.id, entity_id: destination.entityId, location_id: destination.locationId,
        })) };
    }
    normalized.sort((left, right) => Number(left.rule.ranking ?? Number.MAX_SAFE_INTEGER) - Number(right.rule.ranking ?? Number.MAX_SAFE_INTEGER)
      || Number(left.rule.id) - Number(right.rule.id));
    const chosen = normalized[0];
    const rule = chosen.rule;
    const entities = [chosen.entityId];
    const locations = [chosen.locationId];
    const equivalentRuleIds = normalized.slice(1).map((destination) => Number(destination.rule.id));
    const warnings = equivalentRuleIds.length > 0 ? ['duplicate_equivalent_rules'] : [];
    const criteria = rule.criteria as Record<string, unknown>[];
    try {
      await this.client.getItem('Entity', entities[0]);
      await this.assertLocationCompatible(locations[0], entities[0]);
    } catch (error) {
      return { ...base, primary_ip: selected.ip, rule_id: rule.id, status: 'invalid_target', error: error instanceof Error ? error.message : String(error) };
    }
    const criterion = criteria[0];
    let comment: string | undefined;
    let previousLocationName: string | undefined;
    if (input.preservePreviousLocationInComment && currentLocation > 0 && currentLocation !== locations[0]) {
      const oldLocation = await this.client.getItem<Record<string, unknown>>('Location', currentLocation);
      previousLocationName = String(oldLocation.completename ?? oldLocation.name ?? currentLocation);
      comment = `${input.commentPrefix}${previousLocationName}`;
    }
    const status = currentEntity === entities[0] && currentLocation === locations[0] ? 'already_correct' : 'ready';
    return { ...base, primary_ip: selected.ip, selected_rule_id: rule.id, matching_rule_ids: active.map((item) => item.id),
      equivalent_rule_ids: equivalentRuleIds, warnings, rule_name: rule.name, cidr: criterion.pattern,
      target_entity_id: entities[0], target_location_id: locations[0], previous_location_name: previousLocationName,
      comment_to_append: comment, status };
  }

  private ruleDestination(rule: Record<string, unknown>):
    { rule: Record<string, unknown>; entityId: number; locationId: number } | { rule_id: unknown; error: string } {
    const criteria = rule.criteria as Record<string, unknown>[];
    if (criteria.length !== 1) return { rule_id: rule.id, error: 'rule has additional criteria' };
    try {
      const actions = rule.actions as Record<string, unknown>[];
      const entities = [...new Set(actions.filter((action) => action.field === 'entities_id')
        .map((action) => resolveGlpiRelationId(action, 'value', 'Entity')))];
      const locations = [...new Set(actions.filter((action) => action.field === 'locations_id')
        .map((action) => resolveGlpiRelationId(action, 'value', 'Location')))];
      if (entities.length !== 1 || locations.length !== 1 || locations[0] <= 0) {
        return { rule_id: rule.id, error: 'missing or contradictory entity/location actions' };
      }
      return { rule, entityId: entities[0], locationId: locations[0] };
    } catch (error) {
      return { rule_id: rule.id, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private optionalRelationId(item: Record<string, unknown>, field: string, relation: string): number {
    if (item[field] === undefined || item[field] === null || item[field] === '') return 0;
    return resolveGlpiRelationId(item, field, relation);
  }

  private publicPlan(plan: Record<string, unknown>): Record<string, unknown> {
    const { _snapshot, ...result } = plan;
    return result;
  }
}
