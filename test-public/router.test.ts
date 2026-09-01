import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRouter } from '../src/routing/api-router.js';
import { AppConfig } from '../src/config/env.js';

function config(apiMode: AppConfig['apiMode']): AppConfig {
  return {
    glpiUrl: 'https://glpi.example.local',
    apiMode,
    apiVersion: '2.3',
    authMode: 'service_account',
    legacy: {
      userToken: 'user-token',
      appToken: 'app-token',
    },
    highlevel: {},
    http: {
      timeoutMs: 15000,
      maxRetries: 2,
    },
    mcp: {
      logLevel: 'info',
    },
  };
}

test('legacy mode routes every tool to legacy', () => {
  const router = createApiRouter(config('legacy'));
  assert.equal(router.backendForTool('glpi_create_ticket'), 'legacy');
  assert.equal(router.backendForTool('unknown_future_tool'), 'legacy');
});

test('highlevel mode never silently falls back to legacy', () => {
  const router = createApiRouter(config('highlevel'));
  assert.equal(router.backendForTool('glpi_create_ticket'), 'highlevel');
  assert.match(router.describeStartup(), /api_mode=highlevel/);
});

test('highlevel ticket service reports unsupported calls clearly', async () => {
  const router = createApiRouter(config('highlevel'));
  await assert.rejects(
    () => router.services.tickets.search({}),
    /Not supported in GLPI_API_MODE=highlevel: tickets.search/
  );
});

test('highlevel mode exposes the implemented ImportEntity rule service', () => {
  const router = createApiRouter(config('highlevel'));
  assert.ok(router.services.importEntityRules);
  assert.equal(router.backendForTool('glpi_get_import_entity_rule'), 'highlevel');
});

test('highlevel mode exposes organization reads and writes', () => {
  const router = createApiRouter(config('highlevel'));
  assert.ok(router.services.organization);
  assert.equal(router.backendForTool('glpi_create_entity'), 'highlevel');
  assert.equal(router.backendForTool('glpi_create_location'), 'highlevel');
});

test('hybrid mode uses explicit compatibility matrix', () => {
  const router = createApiRouter(config('hybrid'));
  assert.equal(router.backendForTool('glpi_create_ticket'), 'legacy');
  assert.equal(router.backendForTool('glpi_create_ip_network'), 'legacy');
  assert.equal(router.backendForTool('glpi_inventory_create_ip_range_from_cidr'), 'legacy');
  assert.equal(router.backendForTool('glpi_get_import_entity_rule'), 'legacy');
  assert.equal(router.backendForTool('glpi_create_import_entity_subnet_rule'), 'legacy');
  assert.equal(router.backendForTool('glpi_set_import_entity_rule_enabled'), 'legacy');
  assert.equal(router.backendForTool('glpi_create_entity'), 'legacy');
  assert.equal(router.backendForTool('glpi_create_location'), 'legacy');
  assert.ok(router.services.ipNetworks);
  assert.ok(router.services.inventoryPlugin);
  assert.throws(
    () => router.backendForTool('unknown_future_tool'),
    /Not supported in GLPI_API_MODE=highlevel/
  );
});
