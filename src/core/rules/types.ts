export interface RuleListRequest {
  start?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

export interface CreateImportEntitySubnetRuleRequest {
  name: string;
  cidr: string;
  targetEntityId: number;
  targetLocationId: number;
  scopeEntityId?: number;
  ranking?: number;
  description?: string;
  comment?: string;
  recursive?: boolean;
}

/** Undefined preserves the field; null explicitly clears supported text fields. */
export interface UpdateImportEntityRuleRequest {
  name?: string;
  description?: string | null;
  comment?: string | null;
  ranking?: number;
  recursive?: boolean;
  match?: 'AND' | 'OR';
}

export const IMPORT_ENTITY_RULE_CRITERIA = [
  'tag', 'domain', 'subnet', 'ip', 'name', 'serial', 'itemtype', 'oscomment', '_source',
] as const;

export type ImportEntityRuleCriterion = typeof IMPORT_ENTITY_RULE_CRITERIA[number];

/** Native GLPI Rule::PATTERN_* values supported by RuleImportEntity. */
export const IMPORT_ENTITY_RULE_CONDITIONS = {
  is: 0,
  is_not: 1,
  contains: 2,
  does_not_contain: 3,
  starts_with: 4,
  ends_with: 5,
  regex_matches: 6,
  regex_does_not_match: 7,
  exists: 8,
  does_not_exist: 9,
  is_cidr: 333,
  is_not_cidr: 334,
} as const;

export type ImportEntityRuleCondition =
  typeof IMPORT_ENTITY_RULE_CONDITIONS[keyof typeof IMPORT_ENTITY_RULE_CONDITIONS];

const COMMON_IMPORT_ENTITY_RULE_CONDITIONS: readonly ImportEntityRuleCondition[] =
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function allowedImportEntityRuleConditions(
  criterion: ImportEntityRuleCriterion,
): readonly ImportEntityRuleCondition[] {
  if (criterion === '_source') return [0, 1];
  if (criterion === 'ip' || criterion === 'subnet') {
    return [...COMMON_IMPORT_ENTITY_RULE_CONDITIONS, 333, 334];
  }
  return COMMON_IMPORT_ENTITY_RULE_CONDITIONS;
}

export function assertImportEntityRuleCondition(
  criterion: ImportEntityRuleCriterion,
  condition: number,
): asserts condition is ImportEntityRuleCondition {
  const allowed = allowedImportEntityRuleConditions(criterion) as readonly number[];
  if (!allowed.includes(condition)) {
    throw new Error(
      `Condition ${condition} is not supported for RuleImportEntity criterion ${criterion}; allowed: ${allowed.join(', ')}`,
    );
  }
}

export interface AddImportEntityRuleCriterionRequest {
  criterion: ImportEntityRuleCriterion;
  condition: number;
  pattern: string;
}

export function assertCanonicalIPv4CIDR(cidr: string): void {
  const parts = cidr.split('/');
  const octets = parts[0]?.split('.').map(Number) ?? [];
  const prefix = Number(parts[1]);
  if (
    parts.length !== 2 || octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
    !Number.isInteger(prefix) || prefix < 0 || prefix > 32
  ) {
    throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  }
  const address = octets.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const canonical = [24, 16, 8, 0].map((shift) => (network >>> shift) & 0xff).join('.');
  if (parts[0] !== canonical) {
    throw new Error(`CIDR must use its canonical network address: expected ${canonical}/${prefix}`);
  }
}
