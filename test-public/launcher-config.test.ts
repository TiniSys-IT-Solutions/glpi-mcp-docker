import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEndpointProcessConfigs } from '../src/launcher/config.js';

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
