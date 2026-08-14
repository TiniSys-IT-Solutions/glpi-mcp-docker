export const API_MODES = ['legacy', 'highlevel', 'hybrid'] as const;
export type ApiMode = (typeof API_MODES)[number];

export const AUTH_MODES = ['service_account', 'per_user'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export interface AppConfig {
  glpiUrl: string;
  apiMode: ApiMode;
  apiVersion: string;
  authMode: AuthMode;
  legacy: {
    appToken?: string;
    userToken?: string;
    username?: string;
    password?: string;
  };
  highlevel: {
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthRedirectUri?: string;
  };
  http: {
    timeoutMs?: number;
    maxRetries?: number;
  };
  mcp: {
    logLevel: string;
  };
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

function envInt(name: string): number | undefined {
  const raw = optionalEnv(name);
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return n;
}

function parseEnum<T extends readonly string[]>(
  name: string,
  value: string | undefined,
  allowed: T,
  fallback: T[number]
): T[number] {
  const raw = value ?? fallback;
  if (!allowed.includes(raw)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return raw;
}

export function loadConfig(): AppConfig {
  const glpiUrl = optionalEnv('GLPI_URL');
  if (!glpiUrl) throw new Error('GLPI_URL environment variable is required');
  try {
    new URL(glpiUrl);
  } catch {
    throw new Error(`GLPI_URL is not a valid URL: "${glpiUrl}"`);
  }

  const apiMode = parseEnum('GLPI_API_MODE', optionalEnv('GLPI_API_MODE'), API_MODES, 'legacy');
  const authMode = parseEnum(
    'GLPI_AUTH_MODE',
    optionalEnv('GLPI_AUTH_MODE'),
    AUTH_MODES,
    'service_account'
  );

  const legacy = {
    appToken: optionalEnv('GLPI_APP_TOKEN'),
    userToken: optionalEnv('GLPI_USER_TOKEN'),
    username: optionalEnv('GLPI_USERNAME'),
    password: optionalEnv('GLPI_PASSWORD'),
  };

  if ((apiMode === 'legacy' || apiMode === 'hybrid') && authMode === 'service_account') {
    if (!legacy.userToken && !(legacy.username && legacy.password)) {
      throw new Error(
        'Legacy service_account auth requires GLPI_USER_TOKEN, or GLPI_USERNAME + GLPI_PASSWORD.'
      );
    }
  }

  if (authMode === 'per_user') {
    throw new Error('GLPI_AUTH_MODE=per_user is planned but not implemented yet.');
  }

  return {
    glpiUrl,
    apiMode,
    apiVersion: optionalEnv('GLPI_API_VERSION') ?? '2.3',
    authMode,
    legacy,
    highlevel: {
      oauthClientId: optionalEnv('GLPI_OAUTH_CLIENT_ID'),
      oauthClientSecret: optionalEnv('GLPI_OAUTH_CLIENT_SECRET'),
      oauthRedirectUri: optionalEnv('GLPI_OAUTH_REDIRECT_URI'),
    },
    http: {
      timeoutMs: envInt('GLPI_TIMEOUT_MS'),
      maxRetries: envInt('GLPI_MAX_RETRIES'),
    },
    mcp: {
      logLevel: optionalEnv('MCP_LOG_LEVEL') ?? 'info',
    },
  };
}
