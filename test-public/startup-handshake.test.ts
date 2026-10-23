import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('invalid companion configuration exits the launcher before starting Supergateway', () => {
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', fileURLToPath(new URL('../src/launcher.ts', import.meta.url)),
  ], {
    env: {
      GLPI_URL: 'http://127.0.0.1:1',
      GLPI_USER_TOKEN: 'synthetic-token',
      GLPI_ADDRESSING_REPORT_TRANSPORT: 'companion_api',
    },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /configuration error: GLPI_ADDRESSING_REPORT_TRANSPORT=companion_api requires all GLPI OAuth credentials/);
  assert.doesNotMatch(result.stderr, /started stable|SUPERGATEWAY/);
  assert.equal(result.stdout, '');
});

test('initialize, tools/list and server info complete while GLPI warmup is pending', { timeout: 15000 }, async () => {
  let warmupRequests = 0;
  let observeWarmup!: () => void;
  const warmupStarted = new Promise<void>((resolve) => { observeWarmup = resolve; });
  const upstream = createServer((request, _response) => {
    assert.equal(request.url, '/apirest.php/initSession');
    warmupRequests++;
    observeWarmup();
    // Deliberately leave authentication pending: MCP must remain usable.
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    env: {
      GLPI_URL: `http://127.0.0.1:${address.port}`,
      GLPI_API_MODE: 'hybrid',
      GLPI_USER_TOKEN: 'synthetic-test-token',
      GLPI_ADDRESSING_REPORT_TRANSPORT: 'companion_api',
      GLPI_OAUTH_CLIENT_ID: 'synthetic-client',
      GLPI_OAUTH_CLIENT_SECRET: 'synthetic-secret',
      GLPI_OAUTH_USERNAME: 'synthetic-user',
      GLPI_OAUTH_PASSWORD: 'synthetic-password',
      GLPI_TIMEOUT_MS: '60000',
      GLPI_MAX_RETRIES: '0',
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'startup-regression', version: '1.0.0' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('initialize blocked on GLPI warmup')), 10000);
      }),
    ]);
    assert.equal(client.getServerVersion()?.name, 'glpi-mcp-docker');
    await warmupStarted;
    const tools = await client.listTools();
    for (const name of ['glpi_addressing_get_report', 'glpi_addressing_set_ip_comment', 'glpi_preview_consumable_creation', 'glpi_get_consumable_stock', 'glpi_preview_consumable_stock_change', 'glpi_apply_consumable_stock_change']) {
      assert.ok(tools.tools.some((tool) => tool.name === name), `${name} missing`);
    }
    const info = await client.readResource({ uri: 'glpi://server/info' });
    assert.equal(JSON.parse(String(info.contents[0].text)).product.name, 'glpi-mcp-docker');
    assert.equal(warmupRequests, 1);
  } finally {
    clearTimeout(timer);
    upstream.closeAllConnections();
    await client.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
