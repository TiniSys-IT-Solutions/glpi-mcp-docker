export interface OAuthTokenSet {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  scope?: string;
  obtainedAt: number;
}

export interface GlpiOAuthClientConfig {
  url: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

interface OAuthWireToken {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export class GlpiOAuthError extends Error {
  constructor(
    readonly status: number,
    readonly oauthCode: string,
    description?: string
  ) {
    super(`GLPI OAuth token request failed (${status} ${oauthCode}${description ? `: ${description}` : ''})`);
    this.name = 'GlpiOAuthError';
  }
}

export class GlpiOAuthClient {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: GlpiOAuthClientConfig) {
    const baseUrl = config.url.replace(/\/$/, '');
    this.authorizeUrl = `${baseUrl}/api.php/authorize`;
    this.tokenUrl = `${baseUrl}/api.php/token`;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    scope?: string;
    codeChallenge?: string;
  }): string {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: input.redirectUri,
      scope: input.scope ?? 'api user',
      state: input.state,
    });
    if (input.codeChallenge) {
      query.set('code_challenge', input.codeChallenge);
      query.set('code_challenge_method', 'S256');
    }
    return `${this.authorizeUrl}?${query}`;
  }

  authorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<OAuthTokenSet> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
    });
  }

  password(input: { username: string; password: string; scope?: string }): Promise<OAuthTokenSet> {
    return this.requestToken({
      grant_type: 'password',
      username: input.username,
      password: input.password,
      scope: input.scope ?? 'api user',
    });
  }

  refresh(refreshToken: string, scope?: string): Promise<OAuthTokenSet> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...(scope ? { scope } : {}),
    });
  }

  private async requestToken(parameters: Record<string, string>): Promise<OAuthTokenSet> {
    const body = new URLSearchParams({
      ...parameters,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const response = await this.fetchImpl(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = await response.json().catch(() => ({})) as Partial<OAuthWireToken> & {
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new GlpiOAuthError(
        response.status,
        payload.error ?? 'invalid_response',
        payload.error_description
      );
    }
    return {
      tokenType: payload.token_type ?? 'Bearer',
      accessToken: payload.access_token,
      expiresIn: payload.expires_in ?? 0,
      refreshToken: payload.refresh_token,
      scope: payload.scope,
      obtainedAt: Date.now(),
    };
  }
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export class PasswordGrantTokenProvider implements AccessTokenProvider {
  private token?: OAuthTokenSet;

  constructor(
    private readonly oauth: GlpiOAuthClient,
    private readonly credentials: { username: string; password: string; scope?: string }
  ) {}

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    const refreshBeforeMs = 30_000;
    if (this.token && now < this.token.obtainedAt + this.token.expiresIn * 1000 - refreshBeforeMs) {
      return this.token.accessToken;
    }
    if (this.token?.refreshToken) {
      this.token = await this.oauth.refresh(this.token.refreshToken, this.credentials.scope);
    } else {
      this.token = await this.oauth.password(this.credentials);
    }
    return this.token.accessToken;
  }
}
