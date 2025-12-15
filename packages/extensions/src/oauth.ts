/**
 * OAuth configuration and types for extensions
 */

/**
 * OAuth 2.0 configuration for an extension
 */
export interface OAuthConfig {
  /**
   * OAuth authorization URL
   * e.g., "https://github.com/login/oauth/authorize"
   */
  authUrl: string;

  /**
   * OAuth token exchange URL
   * e.g., "https://github.com/login/oauth/access_token"
   */
  tokenUrl: string;

  /**
   * OAuth scopes to request
   */
  scopes: string[];

  /**
   * Additional query parameters for authorization URL
   */
  authParams?: Record<string, string>;

  /**
   * Whether to use PKCE (Proof Key for Code Exchange)
   */
  usePKCE?: boolean;
}

/**
 * OAuth credentials stored securely in environment/secrets
 */
export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Result of OAuth token exchange
 */
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  additionalData?: Record<string, any>;
}

/**
 * OAuth authorization request state
 */
export interface OAuthState {
  extensionType: string;
  organizationId: string;
  userId: string;
  redirectUrl: string;
  nonce: string;
  createdAt: number;
}

/**
 * Extension that supports OAuth authentication
 */
export interface OAuthExtension {
  /**
   * Get OAuth configuration for this extension
   */
  getOAuthConfig(): OAuthConfig;

  /**
   * Get OAuth credentials (from environment/secrets)
   */
  getOAuthCredentials(): Promise<OAuthCredentials>;

  /**
   * Build the authorization URL for initiating OAuth flow
   */
  buildAuthorizationUrl(
    credentials: OAuthCredentials,
    state: string,
    redirectUri: string
  ): string;

  /**
   * Exchange authorization code for access token
   */
  exchangeCodeForToken(
    code: string,
    credentials: OAuthCredentials,
    redirectUri: string
  ): Promise<OAuthTokenResponse>;

  /**
   * Validate and extract necessary configuration from OAuth response
   * This transforms the OAuth token response into the extension's config format
   */
  transformOAuthResponse(
    tokenResponse: OAuthTokenResponse
  ): Promise<Record<string, any>>;

  /**
   * Optional: Refresh an expired access token
   */
  refreshAccessToken?(
    refreshToken: string,
    credentials: OAuthCredentials
  ): Promise<OAuthTokenResponse>;
}

/**
 * Helper to generate a secure random state token
 */
export function generateStateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/**
 * Helper to encode OAuth state as a URL-safe token
 */
export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

/**
 * Helper to decode OAuth state from a URL-safe token
 */
export function decodeOAuthState(token: string): OAuthState {
  return JSON.parse(Buffer.from(token, "base64url").toString());
}

