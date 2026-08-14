export interface HighLevelClientConfig {
  url: string;
  apiVersion: string;
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
    this.apiVersion = config.apiVersion;
    this.baseUrl = `${config.url.replace(/\/$/, '')}/api.php/${config.apiVersion}`;
  }

  async initSession(): Promise<void> {
    throw new HighLevelNotSupportedError('initSession');
  }

  unsupported(toolName: string): never {
    throw new HighLevelNotSupportedError(toolName);
  }
}
