export class GlpiRelationResolutionError extends Error {
  constructor(
    public readonly fieldName: string,
    public readonly relationName: string,
    message: string,
  ) {
    super(message);
    this.name = 'GlpiRelationResolutionError';
  }
}

/** Resolve a GLPI foreign key without ever accepting a label or partial number. */
export function resolveGlpiRelationId(
  item: Record<string, unknown>,
  fieldName: string,
  relationName: string,
): number {
  const value = item[fieldName];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }

  const links = Array.isArray(item.links) ? item.links : [];
  const relation = links.find((candidate): candidate is Record<string, unknown> =>
    typeof candidate === 'object' && candidate !== null &&
    (candidate as Record<string, unknown>).rel === relationName
  );
  if (relation) {
    const href = relation.href;
    if (typeof href === 'string') {
      const escaped = relationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = href.match(new RegExp(`/${escaped}/(0|[1-9]\\d*)/?(?:[?#].*)?$`));
      if (match) {
        const id = Number(match[1]);
        if (Number.isSafeInteger(id) && id >= 0) return id;
      }
      throw new GlpiRelationResolutionError(fieldName, relationName, `Invalid ${relationName} relation URL for ${fieldName}: ${href}`);
    }
  }
  throw new GlpiRelationResolutionError(
    fieldName,
    relationName,
    `Cannot resolve ${relationName} id from ${fieldName}; expected a non-negative integer or a valid ${relationName} link`,
  );
}
