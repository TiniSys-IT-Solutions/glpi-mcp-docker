import assert from 'node:assert/strict';
import test from 'node:test';
import { HighLevelClient } from '../src/api/highlevel/client.js';
import { HighLevelSessionService } from '../src/api/highlevel/session.js';

test('High-Level session uses a Bearer token and the versioned session route', async () => {
  let requestedUrl = '';
  let authorization = '';
  const client = new HighLevelClient({
    url: 'https://glpi.example.test',
    apiVersion: '2.3',
    accessTokenProvider: { getAccessToken: async () => 'access-token' },
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return new Response(JSON.stringify({ current_profile: { id: 4 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const result = await new HighLevelSessionService(client).getInfo();
  assert.equal(requestedUrl, 'https://glpi.example.test/api.php/v2.3/session');
  assert.equal(authorization, 'Bearer access-token');
  assert.deepEqual(result, { current_profile: { id: 4 } });
});

test('High-Level session refuses to run without OAuth credentials', async () => {
  const client = new HighLevelClient({
    url: 'https://glpi.example.test',
    apiVersion: '2.3',
  });
  await assert.rejects(
    () => new HighLevelSessionService(client).getInfo(),
    /OAuth credentials are not configured/
  );
});
