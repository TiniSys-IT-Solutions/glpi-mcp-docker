import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { HighLevelClient } from '../src/api/highlevel/client.js';
import { GlpiOAuthClient, PasswordGrantTokenProvider } from '../src/api/highlevel/oauth.js';

async function main(): Promise<void> {
  // No .env loading: this runner must only use explicit disposable credentials.
  const url = new URL(process.env.GLPI12_TEST_URL ?? 'http://127.0.0.1:8080');
  assert.equal(process.env.GLPI12_DISPOSABLE, '1', 'Explicit disposable opt-in is required');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only loopback test instances are accepted');
  const fixturePath = process.env.GLPI12_TEST_FIXTURE;
  assert.ok(fixturePath, 'GLPI12_TEST_FIXTURE must identify a local synthetic credential file');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    username: string; password: string; clientId: string; clientSecret: string;
  };
  const legacy = new GlpiClient({ url: url.href.replace(/\/$/, ''), ...fixture, maxRetries: 0 });
  await legacy.initSession();
  try {
    const options = await legacy.searchOptions.get('Ticket');
    assert.ok(options.byId.size > 10, 'Native ticket search options are available');
    assert.ok(Array.isArray(await legacy.getItems('Computer', { range: '0-9' })));
    console.log('PASS: GLPI 12 Legacy session, ticket search schema and asset reads');
  } finally {
    await legacy.killSession();
  }
  const oauth = new GlpiOAuthClient({ url: url.href.replace(/\/$/, ''), ...fixture });
  const client = new HighLevelClient({
    url: url.href.replace(/\/$/, ''), apiVersion: '2.3',
    accessTokenProvider: new PasswordGrantTokenProvider(oauth, fixture),
  });
  await client.getSession();
  await client.request('Assets/Computer');
  console.log('PASS: GLPI 12 OAuth password grant, v2.3 session and asset reads');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "GLPI 12 smoke failed");
  process.exitCode = 1;
});
