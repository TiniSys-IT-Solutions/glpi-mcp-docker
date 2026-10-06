import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { LegacyAddressingReportService, addressingIpNumber } from '../src/api/legacy/addressing-report.js';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
type FixtureOptions = { deny?: string; mfa?: boolean; externalRedirect?: boolean; externalComment?: boolean; badRow?: boolean;
  missingValue?: boolean; duplicate?: boolean; linked?: boolean; lostReply?: boolean; failedReadback?: boolean;
  changedReadback?: boolean; password?: boolean; rights?: number; emptyRows?: boolean; wrongRange?: boolean; otherUser?: boolean };

async function fixture(t: TestContext, options: FixtureOptions = {}) {
  const requests: Array<{ path: string; method: string }> = [];
  const comments = new Map([['192.0.2.10', 'Initial & "quoted" <text>'], ['192.0.2.11', ''], ['192.0.2.12', '']]);
  let writes = 0;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, 'http://test.invalid');
      const path = url.pathname.replace(/^\/glpi\//, '');
      requests.push({ path, method: req.method! });
      let body = '';
      for await (const chunk of req) body += chunk;
      const fields = new URLSearchParams(body);
      const json = (value: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      const html = (value: string) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(value); };
      if (options.deny === path || options.failedReadback && writes > 0 && path === 'ajax/common.tabs.php') {
        res.writeHead(403); res.end('<p>denied cookie=must-not-leak</p>'); return;
      }
      if (path.startsWith('apirest.php/')) {
        assert.equal(req.headers.cookie, undefined);
        assert.equal(req.headers['x-glpi-csrf-token'], undefined);
        if (path.endsWith('initSession')) { assert.equal(req.headers.authorization, options.password ? `Basic ${Buffer.from('fake-login:fake-password').toString('base64')}` : 'user_token fake-user-token'); json({ session_token: 'fake-rest-session' }); return; }
        assert.equal(req.headers['session-token'], 'fake-rest-session');
        if (path.endsWith('/Plugin')) { json([{ directory: 'addressing', state: 1, version: '3.2.14' }]); return; }
        if (path.endsWith('/getActiveProfile')) { json({ active_profile: { id: 12, plugin_addressing: options.rights ?? 31 } }); return; }
        if (path.endsWith('/getFullSession')) { json({ session: { glpiID: 23 } }); return; }
        if (path.endsWith('/IPAddress')) { json([]); return; }
        throw new Error('Unexpected REST resource');
      }
      assert.equal(req.headers.authorization, undefined);
      assert.equal(req.headers['app-token'], undefined);
      assert.equal(req.headers['session-token'], undefined);
      assert.equal(url.searchParams.has('user_token'), false);
      if (path === 'index.php') {
        res.setHeader('Set-Cookie', 'glpi_session=fake-pre-login; Path=/glpi; HttpOnly');
        html('<form action="/glpi/front/login.php" method="post"><input name="_glpi_csrf_token" value="fake-login-csrf"></form>'); return;
      }
      if (path === 'front/login.php') {
        assert.equal(req.method, 'POST'); assert.equal(req.headers.cookie, 'glpi_session=fake-pre-login');
        assert.equal(fields.get('_glpi_csrf_token'), 'fake-login-csrf');
        if (options.password) { assert.equal(fields.get('login_name'), 'fake-login'); assert.equal(fields.get('login_password'), 'fake-password'); assert.equal(fields.has('user_token'), false); }
        else { assert.equal(fields.get('user_token'), 'fake-user-token'); assert.equal(fields.get('noAUTO'), '0'); }
        res.setHeader('Set-Cookie', 'glpi_session=fake-authenticated; Path=/glpi; HttpOnly');
        res.writeHead(302, { Location: options.externalRedirect ? 'https://outside.invalid/collect' : options.mfa ? '/glpi/MFA/Prompt' : '/glpi/front/central.php' }); res.end(); return;
      }
      assert.equal(req.headers.cookie, 'glpi_session=fake-authenticated');
      if (path === 'front/central.php') { html('<meta property="glpi:csrf_token" content="fake-ajax-csrf">'); return; }
      if (path.startsWith('Session/')) {
        assert.equal(req.method, 'POST'); assert.equal(req.headers['x-glpi-csrf-token'], 'fake-ajax-csrf');
        assert.equal(req.headers['x-requested-with'], 'XMLHttpRequest');
        assert.equal(fields.get('id'), path.endsWith('ChangeProfile') ? '12' : '2');
        if (path.endsWith('ChangeEntity')) assert.equal(fields.get('is_recursive'), '0');
        res.writeHead(200); res.end(); return;
      }
      if (path === 'ajax/common.tabs.php') {
        if (url.searchParams.get('_itemtype') === 'Preference') {
          assert.equal(url.searchParams.get('_glpi_tab'), 'User$1');
          html(`<form id="main-form" action="/glpi/front/preference.php"><input name="id" value="${options.otherUser ? 24 : 23}"></form>`); return;
        }
        assert.equal(req.method, 'GET'); assert.equal(url.searchParams.get('_glpi_tab'), 'GlpiPlugin\\Addressing\\Addressing$0');
        assert.equal(url.searchParams.get('_itemtype'), 'GlpiPlugin\\Addressing\\Addressing');
        assert.equal(url.searchParams.get('id'), '7'); assert.equal(url.searchParams.get('filter'), '0');
        assert.equal(url.searchParams.has('export'), false);
        const offset = Number(url.searchParams.get('start'));
        const ip = `192.0.2.${10 + offset}`;
        const key = `IP${addressingIpNumber(ip)}`;
        const value = options.changedReadback && writes ? 'Concurrent edit' : comments.get(ip)!;
        const row = (comment: string) => `<tr class="${options.linked ? 'tab_bg_1' : 'plugin_addressing_ping_off'}"><td></td><td>${ip}</td><td>${options.linked ? '<a href="/glpi/front/printer.form.php?id=9">Restricted printer</a>' : 'Ping response'}</td><td></td><td></td><td></td><td><i class="plugin_addressing_icon_ok" title="Last ping attempt : 2026-01-01 12:00:00"></i></td><td></td><td><input type="text" data-addressing-comment="${options.badRow ? 'IP0' : key}" ${options.missingValue ? '' : `value="${escape(comment)}"`}></td><td></td></tr>`;
        html(`<table data-addressing-report data-addressing-id="${options.wrongRange ? 8 : 7}" data-addressing-comment-url="${options.externalComment ? 'https://outside.invalid/collect' : '/glpi/marketplace/addressing/ajax/ipcomment.php'}"><tbody>${options.emptyRows ? '' : row(value)}${options.duplicate ? row('Different text') : ''}</tbody></table>`); return;
      }
      if (path === 'marketplace/addressing/ajax/ipcomment.php') {
        assert.equal(req.method, 'POST'); assert.equal(req.headers['x-glpi-csrf-token'], 'fake-ajax-csrf');
        assert.equal(req.headers['x-requested-with'], 'XMLHttpRequest'); assert.equal(fields.get('addressing_id'), '7');
        assert.deepEqual([...fields.keys()].sort(), ['addressing_id', 'contentC', 'ipname']);
        const ip = [...comments.keys()].find(ip => `IP${addressingIpNumber(ip)}` === fields.get('ipname'))!;
        comments.set(ip, fields.get('contentC')!); writes++;
        if (options.lostReply) { res.destroy(); return; }
        json(0); return;
      }
      throw new Error('Unexpected native route');
    } catch (error) { res.writeHead(500); res.end('Fixture assertion failed'); server.emit('fixture-error', error); }
  });
  const failures: unknown[] = [];
  server.on('fixture-error', error => failures.push(error));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); assert.deepEqual(failures, []); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const client = new GlpiClient({ url: `http://127.0.0.1:${address.port}/glpi`, userToken: options.password ? undefined : 'fake-user-token',
    username: options.password ? 'fake-login' : undefined, password: options.password ? 'fake-password' : undefined,
    appToken: 'fake-app-token', addressingReportTransport: 'native_web', maxRetries: 0 });
  const range = { id: 7, entities_id: 2, begin_ip: '192.0.2.10', end_ip: '192.0.2.12', is_deleted: 0 };
  const service = new LegacyAddressingReportService(client, { get: async () => ({ raw: range }) });
  return { service, requests, comments, writes: () => writes };
}

const input = { range_id: 7, ip: '192.0.2.10', expected_comment: 'Initial & "quoted" <text>', comment: 'Imprimante – étage 1 & "réseau" <validé>' };

test('native web report follows real cookie login, context checks and tab pagination without REST helpers or probes', async t => {
  const f = await fixture(t);
  const report = await f.service.report({ range_id: 7, start: 0, limit: 3 });
  assert.equal(report.transport, 'native_web'); assert.equal(report.rows.length, 3);
  assert.equal(report.rows[0].comment, input.expected_comment); assert.equal(report.rows[0].ping_state, 'ok');
  assert.equal(report.rows[0].selection_reason, 'ping_without_linked_equipment'); assert.equal(report.ping_performed, false);
  assert.equal(f.requests.filter(r => r.path === 'ajax/common.tabs.php').length, 4);
  assert.equal(f.writes(), 0);
  assert.ok(f.requests.every(r => !/IpComment|PingInfo|pinginfo|reserveip|NetworkPort/.test(r.path)));
});

test('native comments preserve Unicode and HTML entities, check expected text, clear and reread writes', async t => {
  const f = await fixture(t);
  const result = await f.service.setComment(input);
  assert.equal(result.success, true); assert.equal(result.verification_status, 'verified'); assert.equal(result.write_completed, true);
  assert.equal(f.comments.get(input.ip), input.comment);
  await assert.rejects(() => f.service.setComment({ ...input, comment: 'Stale edit' }), /changed/);
  assert.equal(f.writes(), 1);
  const same = await f.service.setComment(input); assert.equal(same.idempotent, true); assert.equal(same.write_completed, false);
  const cleared = await f.service.setComment({ ...input, expected_comment: input.comment, comment: '' }); assert.equal(cleared.success, true);
  const created = await f.service.setComment({ range_id: 7, ip: '192.0.2.11', expected_comment: '', comment: input.comment }); assert.equal(created.success, true);
  assert.equal(f.writes(), 3);
});

test('native username/password uses the configured service account without exposing credentials in URLs', async t => {
  const f = await fixture(t, { password: true }); assert.equal((await f.service.setComment(input)).success, true);
});

test('native MCP-local serialization prevents two stale callers from overwriting the same IP', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.service.setComment(input), f.service.setComment({ ...input, comment: 'Second edit' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1); assert.equal(f.writes(), 1);
});

for (const [name, options] of Object.entries({
  MFA: { mfa: true }, externalRedirect: { externalRedirect: true }, externalComment: { externalComment: true },
  differentSSOUser: { otherUser: true },
  mismatchedIP: { badRow: true }, missingCommentValue: { missingValue: true }, contradictoryDuplicates: { duplicate: true },
  loginDenied: { deny: 'front/login.php' }, profileDenied: { deny: 'Session/ChangeProfile' },
  entityDenied: { deny: 'Session/ChangeEntity' }, reportDenied: { deny: 'ajax/common.tabs.php' },
  noUpdateRight: { rights: 1 }, noReadRight: { rights: 2 },
} satisfies Record<string, FixtureOptions>)) {
  test(`native comment stops before writing on ${name}`, async t => {
    const f = await fixture(t, options);
    await assert.rejects(() => f.service.setComment(input)); assert.equal(f.writes(), 0);
    assert.ok(f.requests.every(r => !/IpComment|PingInfo/.test(r.path)));
  });
}

test('native report does not claim a ping-only IP when the native row contains linked equipment', async t => {
  const f = await fixture(t, { linked: true });
  const report = await f.service.report({ range_id: 7, start: 0, limit: 1 }); assert.equal(report.rows[0].selection_reason, null);
});

for (const options of [{ emptyRows: true }, { wrongRange: true }, { missingValue: true }, { deny: 'ajax/common.tabs.php' }]) {
  test(`native report rejects unreadable data ${JSON.stringify(options)} without inventing empty comments`, async t => {
    const f = await fixture(t, options);
    await assert.rejects(() => f.service.report({ range_id: 7, start: 0, limit: 3 })); assert.equal(f.writes(), 0);
    assert.ok(f.requests.every(r => !/IpComment|PingInfo/.test(r.path)));
  });
}

for (const [name, options, status, completed] of [
  ['lost POST reply', { lostReply: true }, 'unavailable', null],
  ['readback denied', { failedReadback: true }, 'unavailable', true],
  ['changed readback', { changedReadback: true }, 'failed', true],
] as const) {
  test(`native comment never claims success or retries after ${name}`, async t => {
    const f = await fixture(t, options);
    const result = await f.service.setComment(input); assert.equal(result.success, false);
    assert.equal(result.verification_status, status); assert.equal(result.write_completed, completed); assert.equal(f.writes(), 1);
    assert.equal(f.requests.filter(r => r.path.endsWith('/ipcomment.php')).length, 1);
    assert.ok(!JSON.stringify(result).includes('must-not-leak'));
  });
}
