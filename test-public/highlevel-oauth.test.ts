import assert from 'node:assert/strict';
import test from 'node:test';
import { GlpiOAuthClient, GlpiOAuthError, PasswordGrantTokenProvider } from '../src/api/highlevel/oauth.js';

test('OAuth authorization URL uses GLPI endpoints, state and PKCE', () => {
  const client = new GlpiOAuthClient({
    url: 'https://glpi.example.test/', clientId: 'client-id', clientSecret: 'client-secret',
  });
  const url = new URL(client.buildAuthorizationUrl({
    redirectUri: 'https://mcp.example.test/oauth/callback', state: 'state-value', codeChallenge: 'challenge',
  }));
  assert.equal(url.pathname, '/api.php/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'api user');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('OAuth refresh posts form data and normalizes the token response', async () => {
  let postedBody = '';
  const client = new GlpiOAuthClient({
    url: 'https://glpi.example.test', clientId: 'client-id', clientSecret: 'client-secret',
    fetchImpl: async (_url, init) => {
      postedBody = String(init?.body);
      return new Response(JSON.stringify({
        token_type: 'Bearer', access_token: 'new-access', expires_in: 3600, refresh_token: 'rotated-refresh',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const token = await client.refresh('old-refresh');
  const form = new URLSearchParams(postedBody);
  assert.equal(form.get('grant_type'), 'refresh_token');
  assert.equal(form.get('client_id'), 'client-id');
  assert.equal(token.accessToken, 'new-access');
  assert.equal(token.refreshToken, 'rotated-refresh');
});

test('OAuth errors expose no submitted client secret', async () => {
  const client = new GlpiOAuthClient({
    url: 'https://glpi.example.test', clientId: 'client-id', clientSecret: 'do-not-leak',
    fetchImpl: async () => new Response(JSON.stringify({
      error: 'invalid_client', error_description: 'Client authentication failed',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
  });
  await assert.rejects(
    () => client.password({ username: 'user', password: 'password' }),
    (error: unknown) => error instanceof GlpiOAuthError && !error.message.includes('do-not-leak')
  );
});

test('concurrent token requests share one OAuth exchange', async () => {
  let calls = 0;
  const oauth = {
    password: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { tokenType: 'Bearer', accessToken: 'shared', expiresIn: 3600, obtainedAt: Date.now() };
    },
    refresh: async () => { throw new Error('unexpected refresh'); },
  } as unknown as GlpiOAuthClient;
  const provider = new PasswordGrantTokenProvider(oauth, { username: 'api', password: 'secret' });

  assert.deepEqual(await Promise.all([
    provider.getAccessToken(),
    provider.getAccessToken(),
    provider.getAccessToken(),
  ]), ['shared', 'shared', 'shared']);
  assert.equal(calls, 1);
});
