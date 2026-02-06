// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

export const secret = {
  googleAiStudioApiKey: new sst.Secret("GoogleAiStudioApiKey"),
  googleClientId: new sst.Secret("GoogleClientId"),
  googleClientSecret: new sst.Secret("GoogleClientSecret"),
  postgresConnectionStringDirect: new sst.Secret("PostgresConnectionStringDirect"),
  postgresConnectionStringPooled: new sst.Secret("PostgresConnectionStringPooled"),
  openAiApiKey: new sst.Secret("OpenAiApiKey"),
  betterAuthSecret: new sst.Secret("BetterAuthSecret"),
  lydieApiKey: new sst.Secret("LydieApiKey"),
  zeroAdminPassword: new sst.Secret("ZeroAdminPassword"),
  // Stripe secrets
  stripeSecretKey: new sst.Secret("StripeSecretKey"),
  stripeMonthlyPriceId: new sst.Secret("StripeMonthlyPriceId"),
  stripeYearlyPriceId: new sst.Secret("StripeYearlyPriceId"),
  stripeWebhookSecret: new sst.Secret("StripeWebhookSecret"),

  // GitHub integration
  githubClientId: new sst.Secret("GitHubClientId"),
  githubClientSecret: new sst.Secret("GitHubClientSecret"),
  githubPrivateKey: new sst.Secret("GitHubPrivateKey"),
  githubAppSlug: new sst.Secret("GitHubAppSlug"),

  // Shopify integration
  shopifyClientId: new sst.Secret("ShopifyClientId"),
  shopifyClientSecret: new sst.Secret("ShopifyClientSecret"),
};
