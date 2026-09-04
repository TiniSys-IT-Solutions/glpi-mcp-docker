export const PRODUCT_NAME = 'glpi-mcp-docker';
export const PRODUCT_VERSION = process.env.APP_VERSION ?? '0.3.6';

export interface BuildInfo {
  product: { name: string; version: string };
  components: {
    upstreamLegacy: string;
    mcpSdk: string;
    supergateway: string;
    zod: string;
    node: string;
  };
}

export function getBuildInfo(): BuildInfo {
  return {
    product: {
      name: PRODUCT_NAME,
      version: PRODUCT_VERSION,
    },
    components: {
      upstreamLegacy: process.env.UPSTREAM_LEGACY_VERSION ?? 'v3.3.0',
      mcpSdk: process.env.MCP_SDK_VERSION ?? '1.30.0',
      supergateway: process.env.SUPERGATEWAY_VERSION ?? '3.4.3',
      zod: process.env.ZOD_VERSION ?? '3.25.76',
      node: process.version,
    },
  };
}

export function formatBuildInfo(): string {
  const info = getBuildInfo();
  return `${info.product.name} v${info.product.version} ` +
    `(upstream-legacy=${info.components.upstreamLegacy}, ` +
    `mcp-sdk=${info.components.mcpSdk}, ` +
    `supergateway=${info.components.supergateway}, ` +
    `zod=${info.components.zod}, ` +
    `node=${info.components.node})`;
}
