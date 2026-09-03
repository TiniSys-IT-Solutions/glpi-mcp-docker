export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export function toolAnnotations(name: string): ToolAnnotations {
  if (/^glpi_(list_|get_|search|count$|tickets_stats)/.test(name) || /^glpi_inventory_(list|get)_/.test(name)) {
    return { readOnlyHint: true, openWorldHint: false };
  }
  if (/^glpi_delete_/.test(name)) {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  // Activation is reversible, idempotent and already guarded by an exact
  // confirmation phrase. Marking it destructive makes approval-policy=never
  // reject the call before the MCP server can validate that confirmation.
  if (name === 'glpi_set_import_entity_rule_enabled') {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (/^glpi_(update_|set_|assign_)/.test(name) || /^glpi_inventory_(update_|enable_|disable_)/.test(name)) {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
}
