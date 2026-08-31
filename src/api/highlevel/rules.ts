import { ImportEntityRuleService } from '../../core/rules/service.js';
import { RuleListRequest } from '../../core/rules/types.js';
import { HighLevelClient } from './client.js';

const COLLECTION_PATH = 'Rule/Collection/ImportEntity/Rule';

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
}

