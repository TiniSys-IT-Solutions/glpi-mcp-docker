import assert from 'node:assert/strict';
import test from 'node:test';
import { LegacyAddressingReportService, addressingIpNumber } from '../src/api/legacy/addressing-report.js';
import { HighLevelAddressingSyncService } from '../src/api/highlevel/addressing-sync.js';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { addressingCommentSchema, addressingReservationApplySchema } from '../src/core/addressing-sync/report-schemas.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

type Row = Record<string, unknown>;
const commentType = 'GlpiPlugin\\Addressing\\IpComment';
function fixture() {
  const range: Row = { id: 7, entities_id: 2, begin_ip: '192.0.2.1', end_ip: '192.0.2.254', fqdns_id: 0, reserved_ip: 1, is_deleted: 0 };
  const rows: Record<string, Row[]> = {
    Plugin: [{ id: 1, directory: 'addressing', version: '3.2.11', state: 1 }],
    Computer: [{ id: 9, entities_id: 2, name: 'Server', is_deleted: 0 }],
    NetworkEquipment: [{ id: 9, entities_id: 2, name: 'Switch', is_deleted: 0 }],
    [commentType]: [], IPAddress: [], NetworkName: [], NetworkPort: [],
  };
  const writes: Array<{ type: string; payload: Row }> = [];
  const reads: Array<{ type: string; range: string }> = [];
  let createChildren = true;
  let failReadback = false;
  const client = {
    getItems: async (type: string, options: { range: string }) => {
      reads.push({ type, range: options.range });
      const [start, end] = options.range.split('-').map(Number);
      return (rows[type] ?? []).slice(start, end + 1);
    },
    getItem: async (type: string, id: number) => {
      if (failReadback && type === commentType) throw new Error('read denied');
      const row = (rows[type] ?? []).find((row) => row.id === id);
      if (!row) throw new Error('not found');
      return row;
    },
    createItem: async (type: string, payload: Row) => {
      writes.push({ type, payload });
      const id = 100 + writes.length;
      rows[type].push({ ...payload, id });
      if (type === 'NetworkPort' && createChildren) {
        rows.NetworkName.push({ id: 200, itemtype: 'NetworkPort', items_id: id, fqdns_id: payload.NetworkName_fqdns_id });
        rows.IPAddress.push({ id: 300, itemtype: 'NetworkName', items_id: 200, name: (payload.NetworkName__ipaddresses as Row)['-100'], entities_id: 2 });
      }
      return { id };
    },
    updateItem: async (type: string, id: number, payload: Row) => {
      writes.push({ type, payload });
      Object.assign(rows[type].find((row) => row.id === id)!, payload);
    },
  } as unknown as GlpiClient;
  const service = new LegacyAddressingReportService(client, { get: async () => ({ raw: range }) });
  return { service, range, rows, writes, reads, omitChildren: () => { createChildren = false; }, failReadback: () => { failReadback = true; } };
}
const request = { range_id: 7, ip: '192.0.2.10', asset_type: 'Computer' as const, asset_id: 9 };
const apply = (fingerprint: string) => ({ ...request, preview_fingerprint: fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_ADDRESSING_RESERVATION' as const });

test('report comments use unsigned IP keys and remain scoped to the selected range', async () => {
  const f = fixture();
  assert.equal(addressingIpNumber('192.0.2.10'), 3221225994);
  f.rows[commentType].push({ id: 1, plugin_addressing_addressings_id: 8, ipname: 'IP3221225994', comments: 'Other range' });
  await f.service.setComment({ range_id: 7, ip: request.ip, comment: 'Gateway', expected_comment: '' });
  assert.deepEqual(f.writes[0], { type: commentType, payload: { plugin_addressing_addressings_id: 7, ipname: 'IP3221225994', comments: 'Gateway' } });
  const report = await f.service.report({ range_id: 7, start: 9, limit: 1 });
  assert.equal(report.rows[0].ip, request.ip);
  assert.equal(report.rows[0].comment, 'Gateway');
  assert.equal(report.rows[0].status, 'unassigned_in_visible_inventory');
  assert.equal(report.ping_performed, false);
});

test('comment updates, retries and clearing do not touch the range comment', async () => {
  const f = fixture();
  const input = { range_id: 7, ip: request.ip, comment: 'Reserved for router', expected_comment: '' };
  await f.service.setComment(input);
  assert.equal((await f.service.setComment(input)).idempotent, true);
  assert.equal(f.writes.length, 1);
  await assert.rejects(() => f.service.setComment({ ...input, comment: 'Overwrite' }), /changed/);
  await f.service.setComment({ ...input, comment: '', expected_comment: input.comment });
  assert.equal(f.rows[commentType].length, 1);
  assert.equal(f.rows[commentType][0].comments, '');
});

test('out-of-range, deleted ranges, unsupported plugin versions and duplicates fail before writes', async () => {
  const f = fixture();
  const input = { range_id: 7, ip: '192.0.3.1', comment: 'x', expected_comment: '' };
  await assert.rejects(() => f.service.setComment(input), /outside/);
  f.range.is_deleted = 1;
  await assert.rejects(() => f.service.previewReservation(request), /deleted/);
  f.range.is_deleted = 0;
  f.rows.Plugin[0].version = '3.2.10';
  await assert.rejects(() => f.service.previewReservation(request), /source-audited/);
  f.rows.Plugin[0].version = '3.2.11';
  f.rows[commentType].push(...[1, 2].map((id) => ({ id, plugin_addressing_addressings_id: 7, ipname: 'IP3221225994', comments: 'x' })));
  await assert.rejects(() => f.service.setComment({ ...input, ip: request.ip }), /Multiple/);
  assert.equal(f.writes.length, 0);
});

test('readback failure reports a completed comment write and its id', async () => {
  const f = fixture(); f.failReadback();
  const result = await f.service.setComment({ range_id: 7, ip: request.ip, comment: 'x', expected_comment: '' });
  assert.equal(result.write_completed, true);
  assert.equal(result.verification_status, 'unavailable');
  assert.equal(result.comment_id, 101);
});

test('reservation creates the source-audited port payload and is visible in the report', async () => {
  const f = fixture();
  const preview = await f.service.previewReservation(request);
  assert.equal(preview.action, 'create'); assert.equal(f.writes.length, 0);
  const result = await f.service.reserve(apply(preview.preview_fingerprint));
  assert.equal(result.success, true);
  assert.equal(result.verification_status, 'verified');
  assert.deepEqual(f.writes[0], { type: 'NetworkPort', payload: { itemtype: 'Computer', items_id: 9, entities_id: 2, name: 'reserv-192.0.2.10', instantiation_type: 'NetworkPortEthernet', _create_children: 1, NetworkName__ipaddresses: { '-100': request.ip }, NetworkName_fqdns_id: 0, mac: '' } });
  const report = await f.service.report({ range_id: 7, start: 9, limit: 1 });
  assert.equal(report.rows[0].status, 'reserved');
  const retry = await f.service.previewReservation(request);
  assert.equal(retry.action, 'unchanged');
  assert.equal((await f.service.reserve(apply(retry.preview_fingerprint))).idempotent, true);
  assert.equal(f.writes.length, 1);
});

test('NetworkEquipment uses aggregate ports and MAC addresses normalize', async () => {
  const f = fixture();
  const plan = await f.service.previewReservation({ ...request, asset_type: 'NetworkEquipment', mac: 'AA:BB:CC:DD:EE:FF' });
  assert.equal(plan.payload.instantiation_type, 'NetworkPortAggregate');
  assert.equal(plan.payload.mac, 'aa:bb:cc:dd:ee:ff');
});

test('cross-entity assets and changed previews cannot create a reservation', async () => {
  const f = fixture();
  f.rows.Computer[0].entities_id = 3;
  await assert.rejects(() => f.service.previewReservation(request), /range entity/);
  f.rows.Computer[0].entities_id = 2;
  const plan = await f.service.previewReservation(request);
  f.rows.Computer[0].name = 'Changed';
  await assert.rejects(() => f.service.reserve(apply(plan.preview_fingerprint)), /stale/);
  assert.equal(f.writes.length, 0);
});

test('allocated IPs including unresolved records block reservations', async () => {
  const f = fixture();
  f.rows.IPAddress.push({ id: 1, name: request.ip, itemtype: 'Other', items_id: 2 });
  const plan = await f.service.previewReservation(request);
  assert.equal(plan.action, 'conflict');
  await assert.rejects(() => f.service.reserve(apply(plan.preview_fingerprint)), /already allocated/);
  assert.equal(f.writes.length, 0);
});

test('a visible allocation created after preview invalidates the fingerprint', async () => {
  const f = fixture();
  const plan = await f.service.previewReservation(request);
  f.rows.IPAddress.push({ id: 1, name: request.ip, itemtype: 'Other', items_id: 2 });
  await assert.rejects(() => f.service.reserve(apply(plan.preview_fingerprint)), /stale/);
  assert.equal(f.writes.length, 0);
});

test('a safety-capped comment scan refuses to report incomplete data', async () => {
  const range: Row = { id: 7, entities_id: 2, begin_ip: '192.0.2.1', end_ip: '192.0.2.254' };
  const fullPage = Array.from({ length: 1000 }, (_, id) => ({ id, plugin_addressing_addressings_id: 7, ipname: `IP${id}`, comments: '' }));
  let pages = 0;
  const service = new LegacyAddressingReportService({ getItems: async () => { pages++; return fullPage; } } as unknown as GlpiClient, { get: async () => ({ raw: range }) });
  await assert.rejects(() => service.report({ range_id: 7, start: 0, limit: 1 }), /incomplete/);
  assert.equal(pages, 100);
});

test('partial native child creation retains the port and blocks duplicate retries', async () => {
  const f = fixture(); f.omitChildren();
  const plan = await f.service.previewReservation(request);
  const result = await f.service.reserve(apply(plan.preview_fingerprint));
  assert.equal(result.success, false);
  assert.equal(result.port_id, 101);
  assert.equal(result.verification_status, 'failed');
  const retry = await f.service.previewReservation(request);
  assert.equal(retry.action, 'conflict');
  await assert.rejects(() => f.service.reserve(apply(retry.preview_fingerprint)), /duplicate/);
  assert.equal(f.writes.length, 1);
});

test('pagination includes comments beyond the first REST page', async () => {
  const f = fixture();
  f.rows[commentType] = Array.from({ length: 1000 }, (_, id) => ({ id: id + 1, plugin_addressing_addressings_id: 8, ipname: `IP${id}`, comments: '' }));
  f.rows[commentType].push({ id: 1001, plugin_addressing_addressings_id: 7, ipname: 'IP3221225994', comments: 'Last page' });
  const report = await f.service.report({ range_id: 7, start: 9, limit: 1 });
  assert.equal(report.rows[0].comment, 'Last page');
  assert.ok(f.reads.some((read) => read.type === commentType && read.range === '1000-1999'));
});

test('validation rejects IPv6, noncanonical IPv4, arbitrary itemtypes and missing confirmation', () => {
  for (const ip of ['2001:db8::1', '192.000.2.1', '192.0.2.999']) assert.throws(() => addressingCommentSchema.parse({ range_id: 7, ip, comment: '', expected_comment: '' }));
  assert.throws(() => addressingReservationApplySchema.parse({ ...apply('a'.repeat(64)), asset_type: 'User' }));
  assert.throws(() => addressingReservationApplySchema.parse({ ...apply('a'.repeat(64)), confirmation: 'NO' }));
});

test('High-Level fails explicitly and report tool annotations are accurate', async () => {
  const service = new HighLevelAddressingSyncService();
  await assert.rejects(() => service.report({ range_id: 7, start: 0, limit: 1 }), /Not supported/);
  await assert.rejects(() => service.reserve(apply('a'.repeat(64))), /Not supported/);
  assert.equal(toolAnnotations('glpi_addressing_get_report').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_addressing_preview_ip_reservation').readOnlyHint, true);
  assert.equal(toolAnnotations('glpi_addressing_set_ip_comment').idempotentHint, true);
  assert.equal(toolAnnotations('glpi_addressing_reserve_ip').readOnlyHint, false);
});
