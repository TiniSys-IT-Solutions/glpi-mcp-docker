import { ImportEntityRuleService } from '../../core/rules/service.js';
import { RuleListRequest } from '../../core/rules/types.js';
import { GlpiClient, ListOptions } from './glpi-client.js';

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
}
