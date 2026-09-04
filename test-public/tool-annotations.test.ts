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
