import { AccessTokenProvider } from './oauth.js';

export interface HighLevelClientConfig {
  url: string;
  apiVersion: string;
  accessTokenProvider?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
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
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private readonly accessTokenProvider?: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${path.replace(/^\//, '')}`, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`GLPI High-Level API request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const body = await response.text();
    let data: unknown;
    try {
      data = body ? JSON.parse(body) : undefined;
    } catch {
      data = body || undefined;
    }
    if (!response.ok) {
      const detail = data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : typeof data === 'string' && data.trim()
          ? data.slice(0, 500)
          : response.statusText;
      throw new HighLevelApiError(response.status, detail, data);
    }
    return data as T;
  }

  unsupported(toolName: string): never {
    throw new HighLevelNotSupportedError(toolName);
  }
}
