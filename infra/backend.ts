/// <reference path="../.sst/platform/config.d.ts" />
import { secret } from "./secret";
import { embeddingQueue } from "./embedding";
import { cluster } from "./cluster";

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
];

export const backend = new sst.aws.Service("Backend", {
  cluster,
  cpu: "0.25 vCPU",
  memory: "0.5 GB",
  architecture: "arm64",
  capacity: "spot",
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
    FRONTEND_URL: $dev ? "http://localhost:3000" : "https://cloud.lydie.co",
  },
  link: [...commonSecrets, embeddingQueue],
  dev: {
    command: "bun dev",
    directory: "packages/backend",
    url: "http://localhost:3001",
  },
});
