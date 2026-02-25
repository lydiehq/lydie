import * as pulumi from "@pulumi/pulumi";

const secrets = new pulumi.Config("secrets");

// AI providers
export const googleAiStudioApiKey = secrets.requireSecret("googleAiStudioApiKey");
export const openAiApiKey = secrets.requireSecret("openAiApiKey");

// OAuth providers
export const googleClientId = secrets.requireSecret("googleClientId");
export const googleClientSecret = secrets.requireSecret("googleClientSecret");

// Auth
export const betterAuthSecret = secrets.requireSecret("betterAuthSecret");

// Stripe
export const stripeSecretKey = secrets.requireSecret("stripeSecretKey");
export const stripeMonthlyPriceId = secrets.requireSecret("stripeMonthlyPriceId");
export const stripeYearlyPriceId = secrets.requireSecret("stripeYearlyPriceId");
export const stripeWebhookSecret = secrets.requireSecret("stripeWebhookSecret");

// GitHub integration
export const githubClientId = secrets.requireSecret("githubClientId");
export const githubClientSecret = secrets.requireSecret("githubClientSecret");
export const githubPrivateKey = secrets.requireSecret("githubPrivateKey");
export const githubAppSlug = secrets.requireSecret("githubAppSlug");

// Shopify integration
export const shopifyClientId = secrets.requireSecret("shopifyClientId");
export const shopifyClientSecret = secrets.requireSecret("shopifyClientSecret");

// Analytics
export const posthogKey = secrets.requireSecret("posthogKey");

// API gateway
export const apiGatewayKey = secrets.requireSecret("apiGatewayKey");

// Error tracking
export const sentryDsn = secrets.requireSecret("sentryDsn");

// Zero sync
export const zeroAdminPassword = secrets.requireSecret("zeroAdminPassword");

// PlanetScale service token (for Pulumi provider auth)
export const planetscaleServiceToken = secrets.requireSecret("planetscaleServiceToken");
export const planetscaleServiceTokenId = secrets.requireSecret("planetscaleServiceTokenId");
