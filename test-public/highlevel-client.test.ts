import assert from 'node:assert/strict';
import test from 'node:test';
import { HighLevelApiError, HighLevelClient, normalizeHighLevelApiVersion } from '../src/api/highlevel/client.js';

const tokenProvider = { getAccessToken: async () => 'token' };

test('normalizeHighLevelApiVersion accepts a bare version', () => {
  assert.equal(normalizeHighLevelApiVersion('2.3'), 'v2.3');
});

test('HighLevelClient preserves status and bounded text from non-JSON errors', async () => {
  const client = new HighLevelClient({
    url: 'https://glpi.example.local',
    apiVersion: '2.3',
    accessTokenProvider: tokenProvider,
    fetchImpl: async () => new Response('<html>proxy unavailable</html>', { status: 502 }),
  });

  await assert.rejects(
    () => client.getSession(),
    (error: unknown) => error instanceof HighLevelApiError
      && error.status === 502
      && error.detail === '<html>proxy unavailable</html>'
  );
});

test('HighLevelClient applies a request timeout', async () => {
  const client = new HighLevelClient({
    url: 'https://glpi.example.local',
    apiVersion: '2.3',
    accessTokenProvider: tokenProvider,
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  });

  await assert.rejects(() => client.getSession(), /timed out after 5ms/);
});

test('normalizeHighLevelApiVersion accepts an already-prefixed version', () => {
  assert.equal(normalizeHighLevelApiVersion('v2.3'), 'v2.3');
});

test('HighLevelClient builds /api.php/v2.3 for bare and prefixed versions', () => {
  const bare = new HighLevelClient({
    url: 'https://glpi.example.local',
    apiVersion: '2.3',
  });
  const prefixed = new HighLevelClient({
    url: 'https://glpi.example.local/',
    apiVersion: 'v2.3',
  });

  assert.equal(bare.baseUrl, 'https://glpi.example.local/api.php/v2.3');
  assert.equal(prefixed.baseUrl, 'https://glpi.example.local/api.php/v2.3');
});
