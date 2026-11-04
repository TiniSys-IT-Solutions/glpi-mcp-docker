import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyObjectDeletionService } from '../src/api/legacy/object-deletion.js';
import { HighLevelObjectDeletionService } from '../src/api/highlevel/object-deletion.js';
import { DELETABLE_OBJECT_TYPES, DELETE_CONFIRMATION, deletionApplySchema, DeletionSelection } from '../src/core/object-deletion/service.js';
import { GlpiError } from '../src/api/legacy/http.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

const correlation = '123e4567-e89b-42d3-a456-426614174000';
function upstreamError(status = 404, code = 'ERROR_ITEM_NOT_FOUND') {
  return new GlpiError({ status, glpiCode: code, method: 'GET', url: '/apirest.php/fixture/1', body: '' });
}
function fixture(type: DeletionSelection['itemtype'] = 'Problem', extra: Record<string, unknown> = {}) {
  const rows: Record<string, any[]> = { [type]: [{ id: 1, name: 'fixture', is_deleted: 0, is_dynamic: 0, projects_id: 0, ipnetworks_id: 0, ...extra }] };
  const writes: unknown[][] = [];
  let verifyError: Error | undefined;
  let writeError = false;
  const client = {
    async getItems(type: string, options: any) {
      const start = Number(options.range.split('-')[0]);
      return (rows[type] ?? []).filter((r) => !('is_deleted' in r) || Boolean(Number(r.is_deleted)) === (options.is_deleted ?? false)).slice(start, start + 1000).map((r) => ({ ...r }));
    },
    async getItem(type: string, id: number) {
      if (writes.length && verifyError) throw verifyError;
      const row = rows[type]?.find((r) => r.id === id);
      if (!row) throw upstreamError();
      return { ...row };
    },
    async deleteItem(type: string, id: number, force: boolean) {
      writes.push([type, id, force]);
      if (writeError) throw new Error('connection lost');
      if (force) rows[type] = rows[type].filter((r) => r.id !== id);
      else rows[type].find((r) => r.id === id).is_deleted = 1;
      return true;
    },
  };
  const service = new LegacyObjectDeletionService(client as any);
  const input = { itemtype: type, id: 1 };
  async function apply(preview: any) { return service.delete({ ...input, preview_fingerprint: preview.preview_fingerprint, confirmation: DELETE_CONFIRMATION, correlation_id: correlation }); }
  return { rows, client, writes, service, input, apply, setVerifyError(error: Error) { verifyError = error; }, failWrite() { writeError = true; } };
}

for (const type of DELETABLE_OBJECT_TYPES) {
  test(`${type}: read-only preview, exact delete and verified trash/permanent semantics`, async () => {
    const f = fixture(type);
    const preview = await f.service.preview(f.input);
    assert.equal(preview.applicable, true);
    assert.equal(preview.reference_scan.complete, true);
    assert.deepEqual(f.writes, []);
    const permanent = ['IPNetwork', 'PluginGlpiinventoryIPRange'].includes(type);
    assert.equal(preview.recoverability, permanent ? 'not_recoverable' : 'trash');
    const result = await f.apply(preview);
    assert.equal(result.success, true);
    assert.equal(result.verification_status, 'verified');
    assert.deepEqual(f.writes, [[type, 1, permanent]]);
  });
}
test('dynamic NetworkName uses native trash, never force purge', async () => {
  const f = fixture('NetworkName', { is_dynamic: 1 });
  const p = await f.service.preview(f.input);
  assert.equal(p.operation, 'move_to_trash');
  assert.equal((await f.apply(p)).verification_status, 'verified');
  assert.equal(f.writes[0][2], false);
});
test('NetworkName blocks IP children in trash and aliases, without touching its parent port', async () => {
  const f = fixture('NetworkName', { itemtype: 'NetworkPort', items_id: 28741 });
  f.rows.IPAddress = [{ id: 10, itemtype: 'NetworkName', items_id: 1, is_deleted: 1 }];
  f.rows.NetworkAlias = [{ id: 11, networknames_id: 1 }];
  const p = await f.service.preview(f.input);
  assert.equal(p.applicable, false);
  assert.equal(p.dependencies.IPAddress.length, 1);
  await assert.rejects(() => f.apply(p), /blocked/);
  assert.equal(f.writes.length, 0);
});
test('each unresolved relation blocks deletion, including job JSON and network hierarchy', async () => {
  for (const [type, relation, row] of [
    ['Problem', 'Problem_Ticket', { id: 2, problems_id: 1 }],
    ['Change', 'ChangeTask', { id: 2, changes_id: 1 }],
    ['Project', 'ProjectTask', { id: 2, projects_id: 1 }],
    ['IPNetwork', 'IPNetwork', { id: 2, ipnetworks_id: 1 }],
    ['IPNetwork', 'IPAddress_IPNetwork', { id: 2, ipnetworks_id: 1 }],
    ['IPNetwork', 'IPNetwork_Vlan', { id: 2, ipnetworks_id: 1 }],
    ['PluginGlpiinventoryIPRange', 'PluginGlpiinventoryIPRange_SNMPCredential', { id: 2, plugin_glpiinventory_ipranges_id: 1 }],
    ['PluginGlpiinventoryIPRange', 'PluginGlpiinventoryTaskjob', { id: 2, targets: '[{"PluginGlpiinventoryIPRange":"1"}]' }],
  ] as const) {
    const f = fixture(type);
    if (relation === type) f.rows[type][0].ipnetworks_id = 0;
    (f.rows[relation] ??= []).push(row);
    const p = await f.service.preview(f.input);
    assert.equal(p.applicable, false, relation);
    await assert.rejects(() => f.apply(p), /blocked/);
    assert.equal(f.writes.length, 0);
  }
});
test('changed object and newly added dependency invalidate the original fingerprint', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.rows.Problem[0].name = 'changed'; },
    (f: ReturnType<typeof fixture>) => { f.rows.Problem_Ticket = [{ id: 2, problems_id: 1 }]; },
  ]) {
    const f = fixture(); const p = await f.service.preview(f.input); mutate(f);
    await assert.rejects(() => f.apply(p), /stale/);
    assert.equal(f.writes.length, 0);
  }
});
test('missing permissions, malformed references and malformed job JSON fail closed', async () => {
  const f = fixture();
  f.client.getItems = async () => { throw upstreamError(403, 'ERROR_RIGHT_MISSING'); };
  assert.equal((await f.service.preview(f.input)).applicable, false);
  const g = fixture('NetworkName');
  g.rows.IPAddress = [{ id: 2, itemtype: 'NetworkName', items_id: 'expanded label' }];
  assert.equal((await g.service.preview(g.input)).reference_scan.complete, false);
  const h = fixture('PluginGlpiinventoryIPRange');
  h.rows.PluginGlpiinventoryTaskjob = [{ id: 2, targets: 'broken JSON' }];
  assert.equal((await h.service.preview(h.input)).applicable, false);
});
test('pagination scans later pages and refuses a truncated 50,000-row scan', async () => {
  const f = fixture('NetworkName');
  f.rows.NetworkAlias = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, networknames_id: i === 1000 ? 1 : 99 }));
  const p = await f.service.preview(f.input);
  assert.equal(p.dependencies.NetworkAlias.length, 1);
  f.client.getItems = async (_type: string, options: any) => Array.from({ length: 1000 }, (_, i) => ({ id: Number(options.range.split('-')[0]) + i + 1, itemtype: 'Other', items_id: 99, networknames_id: 99 }));
  assert.equal((await f.service.preview(f.input)).reference_scan.complete, false);
});
test('permission/network errors after DELETE never prove absence or encourage replay', async () => {
  for (const error of [upstreamError(403, 'ERROR_RIGHT_MISSING'), new Error('timeout'), upstreamError(404, 'ERROR_RESOURCE_NOT_FOUND')]) {
    const f = fixture('IPNetwork'); const p = await f.service.preview(f.input); f.setVerifyError(error);
    const result = await f.apply(p);
    assert.equal(result.success, false);
    assert.equal(result.verification_status, 'outcome_requires_review');
    assert.equal(f.writes.length, 1);
  }
  const f = fixture(); const p = await f.service.preview(f.input); f.failWrite();
  assert.equal((await f.apply(p)).write_status, 'outcome_uncertain');
  assert.equal(f.writes.length, 1);
});
test('confirmation, allowlist, template/dynamic contracts and High-Level boundaries', async () => {
  const f = fixture(); const p = await f.service.preview(f.input);
  await assert.rejects(() => f.service.delete({ ...f.input, preview_fingerprint: p.preview_fingerprint, confirmation: 'yes', correlation_id: correlation }), /I_HAVE_VERIFIED/);
  assert.throws(() => deletionApplySchema.parse({ itemtype: 'User', id: 1 }));
  for (const [type, extra] of [['Project', { is_template: 1 }], ['NetworkName', { is_deleted: undefined }]] as const) {
    const g = fixture(type, extra); assert.equal((await g.service.preview(g.input)).applicable, false);
  }
  assert.equal(toolAnnotations('glpi_preview_delete_business_object').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_delete_business_object').destructiveHint, true);
  await assert.rejects(() => new HighLevelObjectDeletionService().delete(), /not supported/i);
});

test('cleanup order preserves trashed Computer and guards then trashes its port', async () => {
  const { LegacyNetworkTopologyService } = await import('../src/api/legacy/network-topology.js');
  const f = fixture('NetworkName', { itemtype: 'NetworkPort', items_id: 28741 });
  f.rows.NetworkPort = [{ id: 28741, itemtype: 'Computer', items_id: 408, is_deleted: 0 }];
  f.rows.Computer = [{ id: 408, is_deleted: 1 }];
  const topology = new LegacyNetworkTopologyService(f.client as any);
  const selection = { kind: 'network_port' as const, id: 28741 };
  const blocked: any = await topology.previewDelete(selection);
  assert.equal(blocked.applicable, false);
  assert.equal((await f.apply(await f.service.preview(f.input))).success, true);
  const preview: any = await topology.previewDelete(selection);
  assert.equal(preview.applicable, true);
  const result: any = await topology.delete({ ...selection, previewFingerprint: preview.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_NETWORK_OBJECT_DELETE', correlationId: correlation });
  assert.equal(result.verification_status, 'verified');
  assert.deepEqual(f.writes, [['NetworkName', 1, false], ['NetworkPort', 28741, false]]);
  assert.equal(f.rows.Computer[0].is_deleted, 1);
});

test('port delete rejects stale previews/confirmation and verifies failure without purging', async () => {
  const { LegacyNetworkTopologyService } = await import('../src/api/legacy/network-topology.js');
  const f = fixture('NetworkName');
  f.rows.NetworkName = [];
  f.rows.NetworkPort = [{ id: 12, items_id: 408, itemtype: 'Computer', is_deleted: 0 }];
  const service = new LegacyNetworkTopologyService(f.client as any);
  const selection = { kind: 'network_port' as const, id: 12 };
  const p: any = await service.previewDelete(selection);
  const apply = { ...selection, previewFingerprint: p.preview_fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_NETWORK_OBJECT_DELETE', correlationId: correlation };
  await assert.rejects(() => service.delete({ ...apply, confirmation: 'yes' }), /confirmation/);
  f.rows.NetworkPort[0].items_id = 409;
  await assert.rejects(() => service.delete(apply), /stale/);
  assert.equal(f.writes.length, 0);
  const fresh: any = await service.previewDelete(selection);
  f.setVerifyError(upstreamError(403, 'ERROR_RIGHT_MISSING'));
  const result: any = await service.delete({ ...apply, previewFingerprint: fresh.preview_fingerprint });
  assert.equal(result.success, false);
  assert.equal(result.verification_status, 'outcome_requires_review');
  assert.deepEqual(f.writes, [['NetworkPort', 12, false]]);
});
