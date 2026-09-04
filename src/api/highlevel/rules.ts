import { ImportEntityRuleService } from '../../core/rules/service.js';
import { AddImportEntityRuleCriterionRequest, assertCanonicalIPv4CIDR, assertImportEntityRuleCondition, CreateImportEntitySubnetRuleRequest, RuleListRequest, UpdateImportEntityRuleRequest } from '../../core/rules/types.js';
import { HighLevelClient } from './client.js';

const COLLECTION_PATH = 'Rule/Collection/ImportEntity/Rule';
const PATTERN_CIDR = 333;

function updatePayload(input: UpdateImportEntityRuleRequest): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    name: input.name,
    description: input.description === null ? '' : input.description,
    comment: input.comment === null ? '' : input.comment,
    ranking: input.ranking,
    is_recursive: input.recursive,
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

function jsonRequest(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit {
  return {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}

function createdId(response: unknown, resource: string): number {
  if (response && typeof response === 'object' && 'id' in response) {
    const id = Number((response as { id: unknown }).id);
    if (Number.isInteger(id) && id > 0) return id;
  }
  throw new Error(`GLPI High-Level API did not return an id for the created ${resource}`);
}

function query(input: RuleListRequest): string {
  const params = new URLSearchParams();
  params.set('start', String(input.start ?? 0));
  params.set('limit', String(input.limit ?? 50));
  if (input.sort) params.set('sort', input.sort);
  if (input.order) params.set('order', input.order);
  return params.toString();
}

export class HighLevelImportEntityRuleService implements ImportEntityRuleService {
  constructor(private readonly client: HighLevelClient) {}

  list(input: RuleListRequest): Promise<unknown> {
    return this.client.request(`${COLLECTION_PATH}?${query(input)}`);
  }

  get(id: number): Promise<unknown> {
    return this.client.request(`${COLLECTION_PATH}/${id}`);
  }

  listCriteria(ruleId: number, input: RuleListRequest): Promise<unknown> {
    return this.client.request(`${COLLECTION_PATH}/${ruleId}/Criteria?${query(input)}`);
  }

  getCriterion(ruleId: number, criterionId: number): Promise<unknown> {
    return this.client.request(`${COLLECTION_PATH}/${ruleId}/Criteria/${criterionId}`);
  }

  listActions(ruleId: number, input: RuleListRequest): Promise<unknown> {
    return this.client.request(`${COLLECTION_PATH}/${ruleId}/Action?${query(input)}`);
  }

  getAction(ruleId: number, actionId: number): Promise<unknown> {
    return this.client.request(`${COLLECTION_PATH}/${ruleId}/Action/${actionId}`);
  }

  async createSubnetRule(input: CreateImportEntitySubnetRuleRequest): Promise<unknown> {
    assertCanonicalIPv4CIDR(input.cidr);
    const rule = await this.client.request<unknown>(COLLECTION_PATH, jsonRequest('POST', {
      name: input.name,
      entity: { id: input.scopeEntityId ?? 0 },
      is_recursive: input.recursive ?? false,
      description: input.description ?? '',
      comment: input.comment ?? '',
      is_active: false,
      match: 'AND',
      condition: 0,
      ...(input.ranking === undefined ? {} : { ranking: input.ranking }),
    }));
    const ruleId = createdId(rule, 'ImportEntity rule');

    try {
      await this.client.request(`${COLLECTION_PATH}/${ruleId}/Criteria`, jsonRequest('POST', {
        criteria: 'subnet',
        condition: PATTERN_CIDR,
        pattern: input.cidr,
      }));
      await this.client.request(`${COLLECTION_PATH}/${ruleId}/Action`, jsonRequest('POST', {
        action_type: 'assign',
        field: 'entities_id',
        value: String(input.targetEntityId),
      }));
      await this.client.request(`${COLLECTION_PATH}/${ruleId}/Action`, jsonRequest('POST', {
        action_type: 'assign',
        field: 'locations_id',
        value: String(input.targetLocationId),
      }));
      return {
        rule: await this.get(ruleId),
        enabled: false,
        verification_required: true,
      };
    } catch (error) {
      try {
        await this.client.request(`${COLLECTION_PATH}/${ruleId}`, jsonRequest('DELETE'));
      } catch (rollbackError) {
        throw new Error(
          `High-Level rule creation failed and rollback of ImportEntity rule ${ruleId} also failed: ` +
          `${error instanceof Error ? error.message : error}; rollback: ` +
          `${rollbackError instanceof Error ? rollbackError.message : rollbackError}`
        );
      }
      throw error;
    }
  }

  async addCriterion(ruleId: number, input: AddImportEntityRuleCriterionRequest): Promise<unknown> {
    assertImportEntityRuleCondition(input.criterion, input.condition);
    const rule = await this.get(ruleId) as Record<string, unknown>;
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

    const created = await this.client.request(
      `${COLLECTION_PATH}/${ruleId}/Criteria`,
      jsonRequest('POST', {
        criteria: input.criterion,
        condition: input.condition,
        pattern: input.pattern,
      })
    );
    const criterionId = createdId(created, 'ImportEntity criterion');
    const criterion = await this.getCriterion(ruleId, criterionId) as Record<string, unknown>;
    if (
      Number(criterion.rules_id ?? ruleId) !== ruleId ||
      criterion.criteria !== input.criterion ||
      Number(criterion.condition) !== input.condition ||
      criterion.pattern !== input.pattern
    ) {
      throw new Error('Created ImportEntity criterion verification failed: GLPI returned different fields');
    }
    return { created: true, already_exists: false, rule: await this.get(ruleId), criterion };
  }

  async setEnabled(ruleId: number, enabled: boolean): Promise<unknown> {
    await this.get(ruleId);
    await this.client.request(`${COLLECTION_PATH}/${ruleId}`, jsonRequest('PATCH', {
      is_active: enabled,
    }));
    try {
      return { success: true, rule: await this.get(ruleId), enabled, verification_status: 'succeeded' };
    } catch (error) {
      return { ...verificationFailed(ruleId, 'activation', error), enabled };
    }
  }

  async update(ruleId: number, input: UpdateImportEntityRuleRequest): Promise<unknown> {
    await this.get(ruleId);
    const payload = updatePayload(input);
    if (Object.keys(payload).length === 0) throw new Error('Rule update requires at least one field');
    await this.client.request(`${COLLECTION_PATH}/${ruleId}`, jsonRequest('PATCH', payload));
    try {
      return { success: true, rule: await this.get(ruleId), verification_status: 'succeeded' };
    } catch (error) {
      return verificationFailed(ruleId, 'update', error);
    }
  }
}
