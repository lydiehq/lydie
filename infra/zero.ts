// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

import { readFileSync } from "fs";

import { cluster } from "./cluster";
import { secret } from "./secret";

const conn = secret.postgresConnectionStringDirect;

const tag = $dev
  ? `latest`
  : JSON.parse(
      readFileSync("./packages/zero/node_modules/@rocicorp/zero/package.json").toString(),
    ).version.replace("+", "-");
const image = `registry.hub.docker.com/rocicorp/zero:${tag}`;

const commonEnv = {
  ZERO_ADMIN_PASSWORD: secret.zeroAdminPassword.value,
  ZERO_UPSTREAM_DB: conn.value,
  ZERO_CVR_DB: conn.value,
  ZERO_CHANGE_DB: conn.value,
  ZERO_IMAGE_URL: image,
  ZERP_APP_ID: $app.stage,
  ZERO_MUTATE_FORWARD_COOKIES: "true",
  ZERO_QUERY_FORWARD_COOKIES: "true",
  // ZERO_UPSTREAM_MAX_CONNS: "7", // Reduced from default 20
  // ZERO_CHANGE_MAX_CONNS: "2", // Reduced from default 5
  // ZERO_CVR_MAX_CONNS: "7", // Reduced from default 30
  ...($dev ? {} : { ZERO_APP_PUBLICATIONS: "zero_data" }),
  ZERO_MUTATE_URL: $dev
    ? "http://localhost:3001/internal/zero/mutate"
    : "https://api.lydie.co/internal/zero/mutate",
  ZERO_QUERY_URL: $dev
    ? "http://localhost:3001/internal/zero/queries"
    : "https://api.lydie.co/internal/zero/queries",
};

export const zero = new sst.aws.Service("Zero", {
  cluster,
  ...($app.stage === "production"
    ? {
        cpu: "0.25 vCPU",
        memory: "0.5 GB",
        architecture: "arm64",
      }
    : {}),
  image: commonEnv.ZERO_IMAGE_URL,
  health: {
    command: ["CMD-SHELL", "curl -f http://localhost:4848/ || exit 1"],
    interval: "5 seconds",
    retries: 3,
    startPeriod: "300 seconds",
  },
  environment: {
    ...commonEnv,
    ZERO_NUM_SYNC_WORKERS: "4",
  },
  logging: {
    retention: "1 month",
  },
  loadBalancer: {
    ...($dev ? {} : { domain: "zero.lydie.co" }),
    rules: [
      { listen: "80/http", forward: "4848/http" },
      ...($dev ? [] : [{ listen: "443/https" as const, forward: "4848/http" as const }]),
    ],
  },
  transform: {
    service: {
      healthCheckGracePeriodSeconds: 900000,
    },
    target: {
      healthCheck: {
        enabled: true,
        path: "/keepalive",
        protocol: "HTTP",
        interval: 5,
        healthyThreshold: 2,
        timeout: 3,
      },
      stickiness: {
        enabled: true,
        type: "lb_cookie",
        cookieDuration: 120,
      },
      loadBalancingAlgorithmType: "least_outstanding_requests",
    },
  },
  dev: {
    command: "bun dev",
    directory: "/packages/zero",
    url: "http://localhost:4848",
  },
});
