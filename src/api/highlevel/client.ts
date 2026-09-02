import { AccessTokenProvider } from './oauth.js';

export interface HighLevelClientConfig {
  url: string;
  apiVersion: string;
  accessTokenProvider?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
}

export function normalizeHighLevelApiVersion(apiVersion: string): string {
  const trimmed = apiVersion.trim();
  const withoutPrefix = trimmed.replace(/^v/i, '');
  if (!withoutPrefix) {
    throw new Error('GLPI_API_VERSION must not be empty');
  }
  return `v${withoutPrefix}`;
}

export class HighLevelNotSupportedError extends Error {
  constructor(toolName: string) {
    super(`Not supported in GLPI_API_MODE=highlevel: ${toolName}`);
    this.name = 'HighLevelNotSupportedError';
  }
}

export class HighLevelApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly body: unknown
  ) {
    super(`GLPI High-Level API ${status}: ${detail}`);
    this.name = 'HighLevelApiError';
  }
}

export class HighLevelClient {
  readonly baseUrl: string;
  readonly apiVersion: string;

  constructor(config: HighLevelClientConfig) {
    this.apiVersion = normalizeHighLevelApiVersion(config.apiVersion);
    this.baseUrl = `${config.url.replace(/\/$/, '')}/api.php/${this.apiVersion}`;
    this.accessTokenProvider = config.accessTokenProvider;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private readonly accessTokenProvider?: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;

  async initSession(): Promise<void> {
    await this.getSession();
  }

  async getSession(): Promise<unknown> {
    return this.request('session');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.accessTokenProvider) {
      throw new Error('High-Level OAuth credentials are not configured');
    }
    const accessToken = await this.accessTokenProvider.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await this.fetchImpl(`${this.baseUrl}/${path.replace(/^\//, '')}`, { ...init, headers });
    const body = await response.text();
    const data = body ? JSON.parse(body) : undefined;
    if (!response.ok) {
      const detail = data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : response.statusText;
      throw new HighLevelApiError(response.status, detail, data);
    }
    return data as T;
  }

  unsupported(toolName: string): never {
    throw new HighLevelNotSupportedError(toolName);
  }
}
