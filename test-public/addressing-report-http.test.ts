import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { LegacyAddressingReportService } from '../src/api/legacy/addressing-report.js';

function fixture(t: TestContext, denyComments = false) {
  const range = { id: 7, entities_id: 2, begin_ip: '192.0.2.1', end_ip: '192.0.2.254', is_deleted: 0 };
  const commentType = 'GlpiPlugin\\Addressing\\IpComment';
  const pingType = 'GlpiPlugin\\Addressing\\PingInfo';
  const comments: Record<string, unknown>[] = [];
  const requests: Array<{ path: string; method: string; payload?: Record<string, unknown> }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = decodeURIComponent(new URL(String(input)).pathname);
    const method = init?.method ?? 'GET';
    const payload = init?.body ? JSON.parse(String(init.body)).input : undefined;
    requests.push({ path, method, payload });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (path.endsWith('/initSession')) return json({ session_token: 'fake-test-session' });
    assert.equal((init?.headers as Record<string, string>)['Session-Token'], 'fake-test-session');
    if (path.endsWith('/Plugin')) return json([{ directory: 'addressing', version: denyComments ? '3.2.14' : '3.2.15', state: 1 }]);
    if (path.endsWith('/getActiveProfile')) return json({ active_profile: { plugin_addressing: 31 } });
    if (path.endsWith('/IPAddress')) return json([]);
    if (path.endsWith('/' + pingType)) return json([{ id: 1, plugin_addressing_addressings_id: 7,
      ipname: 'IP3221225994', ping_response: 1, ping_date: '2026-01-01 12:00:00' }]);
    assert.ok(path.endsWith('/' + commentType) || path.endsWith('/' + commentType + '/12'), `Unexpected route ${path}`);
    if (denyComments) return json(['ERROR_RIGHT_MISSING', 'Denied by canView'], 403);
    if (method === 'POST') {
      assert.deepEqual(payload, { plugin_addressing_addressings_id: 7, ipname: 'IP3221225994', comments: 'Printer – étage 1' });
      comments.push({ id: 12, ...payload });
      return json({ id: 12 }, 201);
    }
    if (method === 'PUT') {
      assert.equal(payload.id, 12);
      comments[0].comments = payload.comments;
      return json([{ 12: true, message: '' }]);
    }
    assert.equal(method, 'GET');
    return json(path.endsWith('/12') ? comments[0] : comments);
  });
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'fake-user-token', maxRetries: 0 });
  const service = new LegacyAddressingReportService(client, { get: async () => ({ raw: range }) });
  return { service, requests };
}

test('native authenticated REST report/comment routes preserve preconditions and verify create/update', async (t) => {
  // Positive fixture explicitly authorizes these native resources. It does
  // not represent the stock 3.2.14 class-level denial reproduced below.
  const f = fixture(t);
  const report = await f.service.report({ range_id: 7, start: 9, limit: 1 });
  assert.equal(report.rows[0].selection_reason, 'ping_without_linked_equipment');
  const input = { range_id: 7, ip: '192.0.2.10', comment: 'Printer – étage 1', expected_comment: '' };
  const created = await f.service.setComment(input);
  assert.equal(created.success, true); assert.equal(created.comment_id, 12); assert.equal(created.verification_status, 'verified');
  const updated = await f.service.setComment({ ...input, comment: 'Verified printer', expected_comment: input.comment });
  assert.equal(updated.success, true); assert.equal(updated.verification_status, 'verified');
  const count = f.requests.filter(request => request.method !== 'GET').length;
  await assert.rejects(() => f.service.setComment({ ...input, comment: 'Stale overwrite' }), /changed/);
  assert.equal(f.requests.filter(request => request.method !== 'GET').length, count);
  for (let i = 0; i < f.requests.length; i++) if (f.requests[i].method !== 'GET') assert.equal(f.requests[i + 1].method, 'GET');
  assert.ok(f.requests.every(request => !/ajax|NetworkPort|Mcpaddressing/.test(request.path)));
});

test('GenBio 3.2.14 HTTP 403 is diagnosed for both tools and never triggers a write/fallback', async (t) => {
  const f = fixture(t, true);
  await assert.rejects(() => f.service.report({ range_id: 7, start: 0, limit: 10 }), /3\.2\.14.*403.*Super-Admin/);
  await assert.rejects(() => f.service.setComment({ range_id: 7, ip: '192.0.2.10', comment: 'Printer', expected_comment: '' }), /assumed empty/);
  assert.ok(f.requests.every(request => request.method === 'GET'));
  assert.ok(f.requests.every(request => !/ajax|NetworkPort|NetworkName|Mcpaddressing/.test(request.path)));
});
