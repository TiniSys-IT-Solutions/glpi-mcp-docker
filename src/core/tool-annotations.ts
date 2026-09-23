export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export function toolAnnotations(name: string): ToolAnnotations {
  if (/^glpi_(export_|diff_|preview_|simulate_|analyze_|classify_)/.test(name)) {
    return { readOnlyHint: true, openWorldHint: false };
  }
  if (name === 'glpi_inventory_preview_task_schedule') return { readOnlyHint: true, openWorldHint: false };
  if (name === 'glpi_inventory_set_task_reprepare' || name === 'glpi_inventory_prepare_task_once') {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_apply_restore_asset_import_rules') {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_addressing_list_ranges' || name === 'glpi_addressing_get_range' ||
      name === 'glpi_addressing_preview_ip_network_sync') {
    return { readOnlyHint: true, openWorldHint: false };
  }
  if (name === 'glpi_addressing_apply_ip_network_sync') {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (/^glpi_(list_|get_|review_|audit_|find_|resolve_|search|count$|tickets_stats)/.test(name) || /^glpi_inventory_(list|get)_/.test(name)) {
    return { readOnlyHint: true, openWorldHint: false };
  }
  if (/^glpi_delete_/.test(name)) {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_detach_asset_relation') {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_attach_asset_relation') {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_remove_network_link') {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_attach_vlan_to_port' || name === 'glpi_connect_network_ports') {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_delete_network_object') {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_attach_ip_address' || name === 'glpi_move_ip_address') {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_detach_component_from_asset') return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  if (name === 'glpi_attach_component_to_asset') return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  if (name === 'glpi_delete_asset_subobject' || name === 'glpi_delete_item_metadata') {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_inventory_requeue_task' || name === 'glpi_inventory_detach_snmp_credential_from_ip_range') {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  // Activation is reversible, idempotent and already guarded by an exact
  // confirmation phrase. Marking it destructive makes approval-policy=never
  // reject the call before the MCP server can validate that confirmation.
  if (name === 'glpi_set_import_entity_rule_enabled' || /^glpi_(?:inventory_)?update_/.test(name)) {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_add_import_entity_rule_criterion' ||
      name === 'glpi_append_printer_comment' ||
      name === 'glpi_reassign_printers_from_import_entity_rules' ||
      name === 'glpi_reassign_assets_from_location_mapping') {
    return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  }
  if (name === 'glpi_apply_unmanaged_asset_reconciliation') {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
  }
  if (/^glpi_(set_|assign_)/.test(name) || /^glpi_inventory_(enable_|disable_)/.test(name)) {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
}
