export interface HighLevelClientConfig {
  url: string;
  apiVersion: string;
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

export class HighLevelClient {
  readonly baseUrl: string;
  readonly apiVersion: string;

  constructor(config: HighLevelClientConfig) {
    this.apiVersion = normalizeHighLevelApiVersion(config.apiVersion);
    this.baseUrl = `${config.url.replace(/\/$/, '')}/api.php/${this.apiVersion}`;
  }

  async initSession(): Promise<void> {
    throw new HighLevelNotSupportedError('initSession');
  }

  unsupported(toolName: string): never {
    throw new HighLevelNotSupportedError(toolName);
  }
}
