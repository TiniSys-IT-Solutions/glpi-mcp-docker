import { AddImportEntityRuleCriterionRequest, CreateImportEntitySubnetRuleRequest, RuleListRequest, UpdateImportEntityRuleRequest } from './types.js';

/**
 * Read-only contract for rules assigning inventoried items to an entity.
 *
 * A rule detail includes its criteria and actions whenever the backend API
 * returns them inline. Dedicated child methods remain available so callers can
 * inspect older GLPI installations where those relations are not embedded.
 */
export interface ImportEntityRuleService {
  list(input: RuleListRequest): Promise<unknown>;
  get(id: number): Promise<unknown>;
  listCriteria(ruleId: number, input: RuleListRequest): Promise<unknown>;
  getCriterion(ruleId: number, criterionId: number): Promise<unknown>;
  listActions(ruleId: number, input: RuleListRequest): Promise<unknown>;
  getAction(ruleId: number, actionId: number): Promise<unknown>;
  createSubnetRule(input: CreateImportEntitySubnetRuleRequest): Promise<unknown>;
  addCriterion(ruleId: number, input: AddImportEntityRuleCriterionRequest): Promise<unknown>;
  update(ruleId: number, input: UpdateImportEntityRuleRequest): Promise<unknown>;
  setEnabled(ruleId: number, enabled: boolean): Promise<unknown>;
}
