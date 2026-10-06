import assert from 'node:assert/strict';
import test from 'node:test';
import { HighLevelAddressingSyncService } from '../src/api/highlevel/addressing-sync.js';
import { HighLevelClient } from '../src/api/highlevel/client.js';

test('companion Addressing uses the documented OAuth v2 report route', async () => {
  let requested = '';
  const client = new HighLevelClient({ url: 'https://glpi.example.local', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'fake-token' },
    fetchImpl: async (input) => { requested = String(input); return Response.json({ rows: [], ping_performed: false }); } });
  const service = new HighLevelAddressingSyncService(client);
  await service.report({ range_id: 7, start: 0, limit: 50 });
  assert.equal(requested, 'https://glpi.example.local/api.php/v2.3/GenbioCustom/Addressing/Report?range_id=7&start=0&limit=50');
});

test('companion Addressing sends one compare-and-set POST', async () => {
  let calls = 0; let body = '';
  const client = new HighLevelClient({ url: 'https://glpi.example.local', apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'fake-token' },
    fetchImpl: async (_input, init) => { calls++; body = String(init?.body); return Response.json({ status: 'success' }); } });
  const service = new HighLevelAddressingSyncService(client);
  await service.setComment({ range_id: 7, ip: '192.0.2.10', expected_comment: 'before', comment: '' });
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(body), { range_id: 7, ip: '192.0.2.10', expected_comment: 'before', comment: '' });
});
