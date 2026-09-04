import { ImportEntityRuleService } from '../../core/rules/service.js';
import { AddImportEntityRuleCriterionRequest, assertCanonicalIPv4CIDR, assertImportEntityRuleCondition, CreateImportEntitySubnetRuleRequest, RuleListRequest, UpdateImportEntityRuleRequest } from '../../core/rules/types.js';
import { GlpiClient, ListOptions } from './glpi-client.js';

const PATTERN_CIDR = 333;

function legacyUpdatePayload(input: UpdateImportEntityRuleRequest): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    name: input.name,
    description: input.description === null ? '' : input.description,
    comment: input.comment === null ? '' : input.comment,
    ranking: input.ranking,
    is_recursive: input.recursive === undefined ? undefined : input.recursive ? 1 : 0,
    match: input.match,
  }).filter(([, value]) => value !== undefined));
}

function verificationFailed(ruleId: number, operation: 'update' | 'activation', error: unknown) {
  return {
    success: true,
    rule_id: ruleId,
    [`${operation}_status`]: 'succeeded',
    verification_status: 'failed',
    verification_error: error instanceof Error ? error.name : 'UnknownError',
    verification_message: error instanceof Error ? error.message : String(error),
  };
}

function toListOptions(input: RuleListRequest): ListOptions {
  const start = input.start ?? 0;
  const limit = input.limit ?? 50;
  return {
    range: `${start}-${start + limit - 1}`,
    sort: input.sort === undefined ? undefined : Number(input.sort),
    order: input.order ?? 'ASC',
    expand_dropdowns: true,
  };
}

export class LegacyImportEntityRuleService implements ImportEntityRuleService {
  constructor(private readonly client: GlpiClient) {}

  list(input: RuleListRequest): Promise<unknown> {
    return this.client.getItems('RuleImportEntity', toListOptions(input));
  }

  async get(id: number): Promise<unknown> {
    const rule = await this.client.getItem<Record<string, unknown>>('RuleImportEntity', id);
    const [criteria, actions] = await Promise.all([
      this.listCriteria(id, {}),
      this.listActions(id, {}),
    ]);
    return { ...rule, criteria, actions };
  }

  async listCriteria(ruleId: number, input: RuleListRequest): Promise<unknown> {
    const { data } = await this.client.http.request<unknown[]>(
      `RuleImportEntity/${ruleId}/RuleCriteria`,
      { query: this.toQuery(input) }
    );
    return data ?? [];
  }

  async getCriterion(ruleId: number, criterionId: number): Promise<unknown> {
    const criterion = await this.client.getItem<Record<string, unknown>>('RuleCriteria', criterionId);
    this.assertChildOfRule(criterion, ruleId, 'criterion', criterionId);
    return criterion;
  }

  async listActions(ruleId: number, input: RuleListRequest): Promise<unknown> {
    const { data } = await this.client.http.request<unknown[]>(
      `RuleImportEntity/${ruleId}/RuleAction`,
      { query: this.toQuery(input) }
    );
    return data ?? [];
  }

  async getAction(ruleId: number, actionId: number): Promise<unknown> {
    const action = await this.client.getItem<Record<string, unknown>>('RuleAction', actionId);
    this.assertChildOfRule(action, ruleId, 'action', actionId);
    return action;
  }

  async createSubnetRule(input: CreateImportEntitySubnetRuleRequest): Promise<unknown> {
    assertCanonicalIPv4CIDR(input.cidr);
    const rulePayload: Record<string, unknown> = {
      name: input.name,
      sub_type: 'RuleImportEntity',
      entities_id: input.scopeEntityId ?? 0,
      match: 'AND',
      is_active: 0,
      is_recursive: input.recursive ? 1 : 0,
      ...(input.ranking === undefined ? {} : { ranking: input.ranking }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.comment === undefined ? {} : { comment: input.comment }),
    };

    const createdRule = await this.client.createItem('RuleImportEntity', rulePayload);
    const ruleId = createdRule.id;
    try {
      await this.client.createItem('RuleCriteria', {
        rules_id: ruleId,
        criteria: 'subnet',
        condition: PATTERN_CIDR,
        pattern: input.cidr,
      });
      await this.client.createItem('RuleAction', {
        rules_id: ruleId,
        action_type: 'assign',
        field: 'entities_id',
        value: String(input.targetEntityId),
      });
      await this.client.createItem('RuleAction', {
        rules_id: ruleId,
        action_type: 'assign',
        field: 'locations_id',
        value: String(input.targetLocationId),
      });
      return {
        rule: await this.get(ruleId),
        enabled: false,
        verification_required: true,
      };
    } catch (error) {
      try {
        await this.client.deleteItem('RuleImportEntity', ruleId, true, false);
      } catch (rollbackError) {
        throw new Error(
          `Rule creation failed and rollback of RuleImportEntity ${ruleId} also failed: ` +
          `${error instanceof Error ? error.message : error}; rollback: ` +
          `${rollbackError instanceof Error ? rollbackError.message : rollbackError}`
        );
      }
      throw error;
    }
  }

  async addCriterion(ruleId: number, input: AddImportEntityRuleCriterionRequest): Promise<unknown> {
    assertImportEntityRuleCondition(input.criterion, input.condition);
    const rule = await this.client.getItem<Record<string, unknown>>('RuleImportEntity', ruleId);
    if (rule.sub_type !== 'RuleImportEntity') {
      throw new Error(`Rule ${ruleId} is not a RuleImportEntity rule`);
    }
    const existingCriteria = await this.listCriteria(ruleId, {}) as Record<string, unknown>[];
    const existing = existingCriteria.find((item) =>
      item.criteria === input.criterion &&
      Number(item.condition) === input.condition &&
      item.pattern === input.pattern
    );
    if (existing) {
      return { created: false, already_exists: true, rule, criterion: existing };
    }

    const created = await this.client.createItem('RuleCriteria', {
      rules_id: ruleId,
      criteria: input.criterion,
      condition: input.condition,
      pattern: input.pattern,
    });
    const criterion = await this.getCriterion(ruleId, created.id) as Record<string, unknown>;
    this.assertCriterionMatches(criterion, input);
    return { created: true, already_exists: false, rule: await this.get(ruleId), criterion };
  }

  async setEnabled(ruleId: number, enabled: boolean): Promise<unknown> {
    await this.get(ruleId);
    await this.client.updateItem('RuleImportEntity', ruleId, { is_active: enabled ? 1 : 0 });
    try {
      return { success: true, rule: await this.get(ruleId), enabled, verification_status: 'succeeded' };
    } catch (error) {
      return { ...verificationFailed(ruleId, 'activation', error), enabled };
    }
  }

  async update(ruleId: number, input: UpdateImportEntityRuleRequest): Promise<unknown> {
    await this.get(ruleId);
    const payload = legacyUpdatePayload(input);
    if (Object.keys(payload).length === 0) throw new Error('Rule update requires at least one field');
    await this.client.updateItem('RuleImportEntity', ruleId, payload);
    try {
      return { success: true, rule: await this.get(ruleId), verification_status: 'succeeded' };
    } catch (error) {
      return verificationFailed(ruleId, 'update', error);
    }
  }

  private toQuery(input: RuleListRequest): Record<string, string> {
    const options = toListOptions(input);
    return {
      range: options.range as string,
      order: options.order as string,
      expand_dropdowns: 'true',
      ...(options.sort === undefined ? {} : { sort: String(options.sort) }),
    };
  }

  private assertChildOfRule(
    item: Record<string, unknown>,
    ruleId: number,
    childType: string,
    childId: number
  ): void {
    const linkedRuleId = Number(item.rules_id);
    if (!Number.isInteger(linkedRuleId) || linkedRuleId !== ruleId) {
      throw new Error(
        `RuleImportEntity ${ruleId} does not contain ${childType} ${childId}`
      );
    }
  }

  private assertCriterionMatches(item: Record<string, unknown>, expected: AddImportEntityRuleCriterionRequest): void {
    if (
      item.criteria !== expected.criterion ||
      Number(item.condition) !== expected.condition ||
      item.pattern !== expected.pattern
    ) {
      throw new Error('Created RuleCriteria verification failed: GLPI returned different criterion fields');
    }
  }
}
