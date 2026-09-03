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
  assert.deepEqual(toolAnnotations('glpi_update_import_entity_rule'), expected);
});
