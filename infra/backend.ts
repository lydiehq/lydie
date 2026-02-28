// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

import { cluster } from "./cluster";
import { email } from "./email";
import { onboardingEmailProcessorFunction, onboardingSchedulerRole } from "./onboarding";
import { assetsRouter, organizationAssetsBucket } from "./web";
import { workspaceExportBucket, workspaceExportProcessorFunction } from "./workspace-export";

export const backend = new sst.aws.Service("Backend", {
  cluster,
  cpu: "0.25 vCPU",
  memory: "0.5 GB",
  architecture: "arm64",
  loadBalancer: {
    domain: "api.lydie.co",
    rules: [
      {
        listen: "80/http",
        forward: "3001/http",
      },
      {
        listen: "443/https",
        forward: "3001/http",
      },
    ],
  },
  image: {
    dockerfile: "./packages/backend/Dockerfile",
  },
  environment: {
    FRONTEND_URL: $dev ? "http://localhost:3000" : "https://app.lydie.co",
    NODE_ENV: $dev ? "development" : "production",
    APP_STAGE: $app.stage === "production" ? "production" : "development",

    // Database
    DATABASE_URL: process.env.DATABASE_URL,

    // Auth
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_BASE_URL: $dev
      ? "http://localhost:3001/internal/public/auth"
      : "https://api.lydie.co/internal/public/auth",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    CORS_ALLOWED_ORIGINS: $dev
      ? "http://localhost:3000"
      : "https://app.lydie.co,https://lydie.co,https://api.lydie.co",

    // AI
    GOOGLE_AI_STUDIO_API_KEY: process.env.GOOGLE_AI_STUDIO_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,

    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_MONTHLY_PRICE_ID: process.env.STRIPE_MONTHLY_PRICE_ID,
    STRIPE_YEARLY_PRICE_ID: process.env.STRIPE_YEARLY_PRICE_ID,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

    // GitHub integration
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GITHUB_PRIVATE_KEY: process.env.GITHUB_PRIVATE_KEY,
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,

    // Shopify integration
    SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET,

    // Monitoring
    SENTRY_DSN: process.env.SENTRY_DSN,

    // AWS resource references (resolved by SST at deploy time)
    S3_BUCKET_ASSETS: organizationAssetsBucket.name,
    ASSETS_PUBLIC_BASE_URL: assetsRouter.url,
    S3_BUCKET_EXPORTS: workspaceExportBucket.name,
    ONBOARDING_LAMBDA_ARN: onboardingEmailProcessorFunction.arn,
    ONBOARDING_SCHEDULER_ROLE_ARN: onboardingSchedulerRole.arn,
    WORKSPACE_EXPORT_LAMBDA_ARN: workspaceExportProcessorFunction.arn,
  },
  link: [email, organizationAssetsBucket, workspaceExportBucket],
  permissions: [
    { actions: ["scheduler:CreateSchedule"], resources: ["*"] },
    { actions: ["iam:PassRole"], resources: [onboardingSchedulerRole.arn] },
    { actions: ["lambda:InvokeFunction"], resources: ["*"] },
  ],
  transform: {
    target: {
      stickiness: {
        enabled: true,
        type: "lb_cookie",
        cookieDuration: 86400, // 24 hours for WebSocket sticky sessions
      },
    },
  },
  dev: {
    command: "bun dev",
    directory: "packages/backend",
    url: "http://localhost:3001",
  },
});
