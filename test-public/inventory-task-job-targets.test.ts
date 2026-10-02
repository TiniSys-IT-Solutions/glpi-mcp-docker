import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyInventoryPluginService, normalizeTaskJobTargets } from '../src/api/legacy/inventory-plugin.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

function fixture(targets: unknown) {
  const rows: Record<string, Record<string, unknown>> = {
    PluginGlpiinventoryTask: { id: 2, date_mod: 'a' },
    PluginGlpiinventoryTaskjob: { id: 9, plugin_glpiinventory_tasks_id: 2, targets, actors: '[{"Agent":"4"}]', method: 'networkdiscovery', date_mod: 'b' },
    PluginGlpiinventoryIPRange: { id: 62, date_mod: 'c' },
  };
  const writes: unknown[] = [];
  return { writes, client: {
    async getItem(type: string) { return structuredClone(rows[type]); },
    async updateItem(type: string, _id: number, payload: Record<string, unknown>) { writes.push([type, payload]); Object.assign(rows[type], payload); },
  } as any };
}

test('target normalization accepts JSON arrays, indexed objects and decoded arrays', () => {
  const expected = [{ itemtype: 'PluginGlpiinventoryIPRange', id: 62 }, { itemtype: 'Computer', id: 8 }];
  assert.deepEqual(normalizeTaskJobTargets('[{"PluginGlpiinventoryIPRange":"62"},{"Computer":"8"}]'), expected);
  assert.deepEqual(normalizeTaskJobTargets({ 1: { Computer: 8 }, 0: { PluginGlpiinventoryIPRange: 62 } }), expected);
  assert.deepEqual(normalizeTaskJobTargets([{ PluginGlpiinventoryIPRange: 62 }, { Computer: 8 }]), expected);
  assert.throws(() => normalizeTaskJobTargets({ arbitrary: { Computer: 8 } }), /Unknown/);
  assert.throws(() => normalizeTaskJobTargets([{ Computer: 8, Printer: 9 }]), /Ambiguous/);
});

test('preview/apply preserves unrelated targets and is idempotent', async () => {
  const f = fixture('[{"Computer":"8"}]'); const service = new LegacyInventoryPluginService(f.client);
  const preview: any = await service.previewTaskJobTargetChange({ task_id: 2, job_id: 9, ip_range_id: 62, action: 'add' });
  assert.equal(preview.before.length, 1); assert.equal(preview.after.length, 2); assert.equal(f.writes.length, 0);
  const applied: any = await service.applyTaskJobTargetChange({ task_id: 2, job_id: 9, ip_range_id: 62, action: 'add', preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_TASK_JOB_TARGET_CHANGE' });
  assert.equal(applied.verification_status, 'verified'); assert.deepEqual(applied.targets[0], { itemtype: 'Computer', id: 8 });
  const again: any = await service.previewTaskJobTargetChange({ task_id: 2, job_id: 9, ip_range_id: 62, action: 'add' });
  const result: any = await service.applyTaskJobTargetChange({ task_id: 2, job_id: 9, ip_range_id: 62, action: 'add', preview_fingerprint: again.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_TASK_JOB_TARGET_CHANGE' });
  assert.equal(result.idempotent, true); assert.equal(f.writes.length, 1);
});

test('stale preview and weak removal confirmation fail closed', async () => {
  const f = fixture('[{"PluginGlpiinventoryIPRange":"62"}]'); const service = new LegacyInventoryPluginService(f.client);
  const preview: any = await service.previewTaskJobTargetChange({ task_id: 2, job_id: 9, ip_range_id: 62, action: 'remove' });
  await assert.rejects(() => service.applyTaskJobTargetChange({ task_id: 2, job_id: 9, ip_range_id: 62, action: 'remove', preview_fingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_TASK_JOB_TARGET_CHANGE' }), /removal requires/);
  await assert.rejects(() => service.applyTaskJobTargetChange({ task_id: 2, job_id: 9, ip_range_id: 62, action: 'remove', preview_fingerprint: '0'.repeat(64), confirmation: 'I_HAVE_VERIFIED_THE_TASK_JOB_TARGET_REMOVAL' }), /stale/);
  assert.equal(f.writes.length, 0);
});

test('annotations separate read preview, additive apply and destructive removal', () => {
  assert.equal(toolAnnotations('glpi_inventory_preview_task_job_target_change').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_inventory_apply_task_job_target_change').destructiveHint, false);
  assert.equal(toolAnnotations('glpi_inventory_apply_task_job_target_removal').destructiveHint, true);
});
