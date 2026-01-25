import type { IntegrationConnection } from "./types";

// OAuth config for integrations
export interface OAuthConfig {
  authUrl: string; // e.g., "https://github.com/login/oauth/authorize"
  tokenUrl: string; // e.g., "https://github.com/login/oauth/access_token"
  scopes: string[];
  authParams?: Record<string, string>;
}

// OAuth credentials from environment/secrets
export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

// OAuth token exchange result
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  additionalData?: Record<string, any>;
}

// OAuth state passed through the flow
export interface OAuthState {
  integrationType: string;
  organizationId: string;
  userId: string;
  redirectUrl: string;
  nonce: string;
  createdAt: number;
}

// Integration that supports OAuth
export interface OAuthIntegration {
  getOAuthConfig(): OAuthConfig;
  getOAuthCredentials(): Promise<OAuthCredentials>;
  buildAuthorizationUrl(
    credentials: OAuthCredentials,
    state: string,
    redirectUri: string,
    params?: Record<string, string>,
  ): string;
  handleOAuthCallback(
    queryParams: Record<string, string>,
    credentials: OAuthCredentials,
    redirectUri: string,
  ): Promise<Record<string, any>>;
  // Optional: refresh expired tokens
  refreshAccessToken?(
    refreshToken: string,
    credentials: OAuthCredentials,
  ): Promise<OAuthTokenResponse>;
  // Optional: get fresh token (e.g., GitHub Apps generate new installation tokens)
  getAccessToken?(connection: IntegrationConnection): Promise<string>;
}

// Encode OAuth state as URL-safe token
export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

// Decode OAuth state from URL-safe token
export function decodeOAuthState(token: string): OAuthState {
  return JSON.parse(Buffer.from(token, "base64url").toString());
}
