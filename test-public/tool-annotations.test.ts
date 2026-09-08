import assert from 'node:assert/strict';
import test from 'node:test';
import { toolAnnotations } from '../src/core/tool-annotations.js';

test('verified rule activation is reversible and does not request destructive approval', () => {
  assert.deepEqual(toolAnnotations('glpi_set_import_entity_rule_enabled'), {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
});

test('genuinely destructive tools remain annotated as destructive', () => {
  assert.equal(toolAnnotations('glpi_delete_ticket').destructiveHint, true);
  assert.equal(toolAnnotations('glpi_inventory_requeue_task').destructiveHint, true);
  assert.equal(toolAnnotations('glpi_inventory_detach_snmp_credential_from_ip_range').destructiveHint, true);
});

test('IP network and other partial updates are non-destructive writes', () => {
  const expected = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  assert.deepEqual(toolAnnotations('glpi_update_ip_network'), expected);
  assert.deepEqual(toolAnnotations('glpi_update_entity'), expected);
  assert.deepEqual(toolAnnotations('glpi_update_location'), expected);
  assert.deepEqual(toolAnnotations('glpi_update_import_entity_rule'), expected);
  assert.deepEqual(toolAnnotations('glpi_inventory_update_ip_range_snmp_credential'), expected);
});

test('SNMP association reads and attach use appropriate annotations', () => {
  assert.equal(toolAnnotations('glpi_inventory_list_ip_range_snmp_credentials').readOnlyHint, true);
  assert.deepEqual(toolAnnotations('glpi_inventory_attach_snmp_credential_to_ip_range'), {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  });
});

test('idempotent criterion addition is a non-destructive write', () => {
  assert.deepEqual(toolAnnotations('glpi_add_import_entity_rule_criterion'), {
    readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
  });
});

test('printer update, comment append and controlled reassignment are idempotent non-destructive writes', () => {
  for (const name of ['glpi_update_printer', 'glpi_append_printer_comment', 'glpi_reassign_printers_from_import_entity_rules']) {
    assert.deepEqual(toolAnnotations(name), {
      readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
  }
});

test('native form and proofreading tools are read-only', () => {
  for (const name of ['glpi_list_forms', 'glpi_get_form', 'glpi_list_form_categories', 'glpi_review_forms']) {
    assert.equal(toolAnnotations(name).readOnlyHint, true);
    assert.notEqual(toolAnnotations(name).destructiveHint, true);
  }
});

test('Location audits are read-only while deletion remains destructive', () => {
  for (const name of ['glpi_list_item_history', 'glpi_list_location_history', 'glpi_audit_locations', 'glpi_find_location_duplicates', 'glpi_resolve_location', 'glpi_list_ldap_directories', 'glpi_get_ldap_location_mapping', 'glpi_list_automatic_actions', 'glpi_list_cron_executions']) {
    assert.equal(toolAnnotations(name).readOnlyHint, true);
    assert.notEqual(toolAnnotations(name).destructiveHint, true);
  }
  for (const name of ['glpi_delete_location', 'glpi_delete_unused_locations']) {
    assert.equal(toolAnnotations(name).destructiveHint, true);
  }
});
