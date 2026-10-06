import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('MCP stdio transport connects before the optional GLPI session warmup', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const connect = source.indexOf('await server.connect(transport)');
  const warmup = source.indexOf('void client.initSession().then');
  assert.ok(connect >= 0, 'server.connect call is missing');
  assert.ok(warmup > connect, 'GLPI warmup must not block MCP initialize');
});
