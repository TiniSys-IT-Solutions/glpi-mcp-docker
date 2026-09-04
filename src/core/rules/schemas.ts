import { z } from 'zod';
import { IMPORT_ENTITY_RULE_CRITERIA, assertImportEntityRuleCondition } from './types.js';

export const importEntityRuleCriterionCreateSchema = z.object({
  rule_id: z.number().int().min(1),
  criterion: z.enum(IMPORT_ENTITY_RULE_CRITERIA),
  condition: z.number().int(),
  pattern: z.string().min(1),
}).strict().superRefine((value, context) => {
  try {
    assertImportEntityRuleCondition(value.criterion, value.condition);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['condition'],
      message: error instanceof Error ? error.message : 'Unsupported RuleImportEntity condition',
    });
  }
});
