// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

import { cluster } from "./cluster";
import { email } from "./email";
import {
  onboardingEmailProcessorFunction,
  onboardingEmailProcessorFunctionLinkable,
  onboardingSchedulerRole,
  onboardingSchedulerRoleLinkable,
} from "./onboarding";
import { secret } from "./secret";
import { assetsRouter, organizationAssetsBucket } from "./web";

const commonSecrets = [
  secret.googleAiStudioApiKey,
  secret.openAiApiKey,
  secret.googleClientId,
  secret.googleClientSecret,
  secret.postgresConnectionStringPooled,
  secret.postgresConnectionStringDirect,
  secret.betterAuthSecret,
  secret.polarApiKey,
  secret.polarProProductId,
  secret.polarWebhookSecret,
  secret.githubClientId,
  secret.githubClientSecret,
  secret.githubPrivateKey,
  secret.githubAppSlug,
  secret.shopifyClientId,
  secret.shopifyClientSecret,
];

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
  },
  link: [
    ...commonSecrets,
    email,
    organizationAssetsBucket,
    assetsRouter,
    onboardingEmailProcessorFunction,
    onboardingEmailProcessorFunctionLinkable,
    onboardingSchedulerRole,
    onboardingSchedulerRoleLinkable,
  ],
  permissions: [
    { actions: ["scheduler:CreateSchedule"], resources: ["*"] },
    { actions: ["iam:PassRole"], resources: [onboardingSchedulerRole.arn] },
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
