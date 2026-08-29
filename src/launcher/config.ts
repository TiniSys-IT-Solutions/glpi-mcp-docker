export type ChildApiMode = 'legacy' | 'highlevel' | 'hybrid';

export interface EndpointProcessConfig {
  name: 'stable' | 'preview';
  enabled: boolean;
  port: number;
  path: string;
  apiMode: ChildApiMode;
  critical: boolean;
}

function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function envPort(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = optionalEnv(env, name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

function envBoolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = optionalEnv(env, name)?.toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be true or false`);
}

function envMode(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: ChildApiMode
): ChildApiMode {
  const value = optionalEnv(env, name) ?? fallback;
  if (value !== 'legacy' && value !== 'highlevel' && value !== 'hybrid') {
    throw new Error(`${name} must be legacy, highlevel, or hybrid`);
  }
  return value;
}

export function loadEndpointProcessConfigs(
  env: NodeJS.ProcessEnv = process.env
): EndpointProcessConfig[] {
  const stablePort = envPort(env, 'MCP_STABLE_PORT', envPort(env, 'MCP_PORT', 8000));
  const previewEnabled = envBoolean(env, 'MCP_PREVIEW_ENABLED', false);
  const previewPort = envPort(env, 'MCP_PREVIEW_PORT', 8001);

  if (previewEnabled && previewPort === stablePort) {
    throw new Error('MCP_PREVIEW_PORT must differ from MCP_STABLE_PORT');
  }

  return [
    {
      name: 'stable',
      enabled: true,
      port: stablePort,
      path: optionalEnv(env, 'MCP_STABLE_PATH') ?? optionalEnv(env, 'MCP_PATH') ?? '/mcp',
      apiMode: envMode(
        env,
        'MCP_STABLE_API_MODE',
        envMode(env, 'GLPI_API_MODE', 'legacy')
      ),
      critical: true,
    },
    {
      name: 'preview',
      enabled: previewEnabled,
      port: previewPort,
      path: optionalEnv(env, 'MCP_PREVIEW_PATH') ?? '/mcp',
      apiMode: envMode(env, 'MCP_PREVIEW_API_MODE', 'highlevel'),
      critical: false,
    },
  ];
}
