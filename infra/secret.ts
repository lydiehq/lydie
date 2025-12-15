/// <reference path="../.sst/platform/config.d.ts" />

export const secret = {
  googleAiStudioApiKey: new sst.Secret("GoogleAiStudioApiKey"),
  googleClientId: new sst.Secret("GoogleClientId"),
  googleClientSecret: new sst.Secret("GoogleClientSecret"),
  postgresConnectionStringDirect: new sst.Secret(
    "PostgresConnectionStringDirect"
  ),
  postgresConnectionStringPooled: new sst.Secret(
    "PostgresConnectionStringPooled"
  ),
  openAiApiKey: new sst.Secret("OpenAiApiKey"),
  betterAuthSecret: new sst.Secret("BetterAuthSecret"),
  lydieApiKey: new sst.Secret("LydieApiKey"),
  zeroAdminPassword: new sst.Secret("ZeroAdminPassword"),
  polarApiKey: new sst.Secret("PolarApiKey"),
  polarProProductId: new sst.Secret("PolarProProductId"),
  polarWebhookSecret: new sst.Secret("PolarWebhookSecret"),

  // Native GitHub extension
  githubClientId: new sst.Secret("GitHubClientId"),
  githubClientSecret: new sst.Secret("GitHubClientSecret"),
  githubAppId: new sst.Secret("GitHubAppId"),
  githubPrivateKey: new sst.Secret("GitHubPrivateKey"),
  githubAppSlug: new sst.Secret("GitHubAppSlug"),
  githubWebhookSecret: new sst.Secret("GitHubWebhookSecret"),
};
