/** Add stable MCP aliases while preserving every native API property. */
export function normalizeEntityResource(resource: unknown): unknown {
  if (Array.isArray(resource)) return resource.map(normalizeEntityResource);
  if (!resource || typeof resource !== 'object') return resource;
  const raw = resource as Record<string, unknown>;
  const aliases: Record<string, unknown> = {};
  if ('entity_ldapfilter' in raw) aliases.ldap_filter = raw.entity_ldapfilter;
  if ('authldaps_id' in raw) aliases.ldap_directory_id = raw.authldaps_id;
  if ('authldap' in raw) {
    const directory = raw.authldap;
    aliases.ldap_directory_id = directory && typeof directory === 'object'
      ? (directory as Record<string, unknown>).id
      : directory;
  }
  if ('tag' in raw) aliases.inventory_tag = raw.tag;
  return { ...raw, ...aliases };
}
