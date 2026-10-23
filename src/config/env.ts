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
    addressingReportTransport?: 'legacy_rest' | 'native_web' | 'companion_api';
  };
  highlevel: {
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthUsername?: string;
    oauthPassword?: string;
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

function optionalEnv(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = env[name];
  return value && value.trim() !== '' ? value : undefined;
}

function envInt(name: string, env: NodeJS.ProcessEnv, minimum = 0): number | undefined {
  const raw = optionalEnv(name, env);
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n) || String(n) !== raw || n < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}, got "${raw}"`);
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const optional = (name: string) => optionalEnv(name, env);
  const glpiUrl = optional('GLPI_URL');
  if (!glpiUrl) throw new Error('GLPI_URL environment variable is required');
  try {
    const parsedUrl = new URL(glpiUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('unsupported protocol');
    }
    if (parsedUrl.username || parsedUrl.password || parsedUrl.hash) {
      throw new Error('credentials and fragments are forbidden');
    }
  } catch {
    throw new Error(`GLPI_URL is not a valid URL: "${glpiUrl}"`);
  }

  const apiMode = parseEnum('GLPI_API_MODE', optional('GLPI_API_MODE'), API_MODES, 'legacy');
  const authMode = parseEnum(
    'GLPI_AUTH_MODE',
    optional('GLPI_AUTH_MODE'),
    AUTH_MODES,
    'service_account'
  );

  const legacy = {
    appToken: optional('GLPI_APP_TOKEN'),
    userToken: optional('GLPI_USER_TOKEN'),
    username: optional('GLPI_USERNAME'),
    password: optional('GLPI_PASSWORD'),
    addressingReportTransport: parseEnum('GLPI_ADDRESSING_REPORT_TRANSPORT', optional('GLPI_ADDRESSING_REPORT_TRANSPORT'), ['legacy_rest', 'native_web', 'companion_api'] as const, 'legacy_rest'),
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

  const apiVersion = optional('GLPI_API_VERSION') ?? '2.3';
  if (!/^v?\d+\.\d+$/.test(apiVersion)) {
    throw new Error('GLPI_API_VERSION must use MAJOR.MINOR format, for example 2.3');
  }

  if (legacy.addressingReportTransport === 'companion_api' && ![
    optional('GLPI_OAUTH_CLIENT_ID'), optional('GLPI_OAUTH_CLIENT_SECRET'),
    optional('GLPI_OAUTH_USERNAME'), optional('GLPI_OAUTH_PASSWORD'),
  ].every(Boolean)) {
    throw new Error('GLPI_ADDRESSING_REPORT_TRANSPORT=companion_api requires all GLPI OAuth credentials');
  }

  return {
    glpiUrl,
    apiMode,
    apiVersion,
    authMode,
    legacy,
    highlevel: {
      oauthClientId: optional('GLPI_OAUTH_CLIENT_ID'),
      oauthClientSecret: optional('GLPI_OAUTH_CLIENT_SECRET'),
      oauthUsername: optional('GLPI_OAUTH_USERNAME'),
      oauthPassword: optional('GLPI_OAUTH_PASSWORD'),
      oauthRedirectUri: optional('GLPI_OAUTH_REDIRECT_URI'),
    },
    http: {
      timeoutMs: envInt('GLPI_TIMEOUT_MS', env, 1),
      maxRetries: envInt('GLPI_MAX_RETRIES', env),
    },
    mcp: {
      logLevel: optional('MCP_LOG_LEVEL') ?? 'info',
    },
  };
}
