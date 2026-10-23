import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEndpointProcessConfigs, validateEndpointAppConfigs } from '../src/launcher/config.js';

test('launcher rejects incomplete companion OAuth configuration before opening endpoints', () => {
  const env = {
    GLPI_URL: 'https://glpi.example.local',
    GLPI_USER_TOKEN: 'synthetic-token',
    GLPI_ADDRESSING_REPORT_TRANSPORT: 'companion_api',
    GLPI_OAUTH_CLIENT_ID: 'synthetic-client',
    GLPI_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GLPI_OAUTH_USERNAME: 'synthetic-user',
    GLPI_OAUTH_PASSWORD: 'synthetic-password',
  };
  const configs = loadEndpointProcessConfigs(env);
  assert.doesNotThrow(() => validateEndpointAppConfigs(configs, env));
  for (const name of ['GLPI_OAUTH_CLIENT_ID', 'GLPI_OAUTH_CLIENT_SECRET', 'GLPI_OAUTH_USERNAME', 'GLPI_OAUTH_PASSWORD']) {
    assert.throws(
      () => validateEndpointAppConfigs(configs, { ...env, [name]: '' }),
      /requires all GLPI OAuth credentials/
    );
  }
});

test('launcher validates the effective endpoint API mode rather than the global mode', () => {
  const env = { GLPI_URL: 'https://glpi.example.local', GLPI_API_MODE: 'highlevel', MCP_STABLE_API_MODE: 'hybrid' };
  assert.throws(
    () => validateEndpointAppConfigs(loadEndpointProcessConfigs(env), env),
    /Legacy service_account auth requires/
  );
  const highlevel = { ...env, MCP_STABLE_API_MODE: 'highlevel' };
  assert.doesNotThrow(() => validateEndpointAppConfigs(loadEndpointProcessConfigs(highlevel), highlevel));
});

test('launcher keeps the current single-port Legacy behavior by default', () => {
  const [stable, preview] = loadEndpointProcessConfigs({});
  assert.deepEqual(stable, {
    name: 'stable', enabled: true, port: 8000, path: '/mcp', apiMode: 'legacy', critical: true,
  });
  assert.equal(preview.enabled, false);
});

test('launcher enables independent Hybrid stable and High-Level preview endpoints', () => {
  const [stable, preview] = loadEndpointProcessConfigs({
    MCP_PREVIEW_ENABLED: 'true',
    MCP_STABLE_PORT: '8000',
    MCP_PREVIEW_PORT: '8001',
    MCP_STABLE_API_MODE: 'hybrid',
    MCP_PREVIEW_API_MODE: 'highlevel',
  });
  assert.equal(stable.apiMode, 'hybrid');
  assert.equal(preview.apiMode, 'highlevel');
  assert.equal(preview.enabled, true);
  assert.equal(preview.critical, false);
});

test('launcher rejects a port collision when preview is enabled', () => {
  assert.throws(
    () => loadEndpointProcessConfigs({
      MCP_PREVIEW_ENABLED: 'true', MCP_STABLE_PORT: '8000', MCP_PREVIEW_PORT: '8000',
    }),
    /must differ/
  );
});

test('stable keeps backward-compatible MCP_PORT and GLPI_API_MODE fallbacks', () => {
  const [stable] = loadEndpointProcessConfigs({
    MCP_PORT: '8123',
    MCP_PATH: '/legacy-mcp',
    GLPI_API_MODE: 'hybrid',
  });
  assert.equal(stable.port, 8123);
  assert.equal(stable.path, '/legacy-mcp');
  assert.equal(stable.apiMode, 'hybrid');
});

test('preview cannot be enabled on an invalid port', () => {
  assert.throws(
    () => loadEndpointProcessConfigs({
      MCP_PREVIEW_ENABLED: 'true', MCP_PREVIEW_PORT: '70000',
    }),
    /between 1 and 65535/
  );
});
