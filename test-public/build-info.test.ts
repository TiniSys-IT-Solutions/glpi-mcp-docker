import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PRODUCT_NAME, PRODUCT_VERSION, formatBuildInfo, getBuildInfo } from '../src/build-info.js';

test('product identity uses the downstream release version', () => {
  const packageMetadata = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { name: string; version: string };

  assert.equal(PRODUCT_NAME, 'glpi-mcp-docker');
  assert.equal(PRODUCT_VERSION, '0.2.7');
  assert.equal(PRODUCT_NAME, packageMetadata.name);
  assert.equal(PRODUCT_VERSION, packageMetadata.version);
});

test('build metadata keeps component versions separate from the product version', () => {
  const info = getBuildInfo();

  assert.equal(info.product.version, '0.2.7');
  assert.equal(info.components.upstreamLegacy, 'v3.3.0');
  assert.equal(info.components.mcpSdk, '1.30.0');
  assert.equal(info.components.supergateway, '3.4.3');
  assert.equal(info.components.zod, '3.25.76');
  assert.match(formatBuildInfo(), /^glpi-mcp-docker v0\.2\.7 \(upstream-legacy=v3\.3\.0, /);
});
