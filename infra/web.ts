/// <reference path="../.sst/platform/config.d.ts" />
import { secret } from "./secret";
import { zero } from "./zero";


const frontendRouter = new sst.aws.Router("Frontend", {
  transform: {
    cachePolicy: {
      defaultTtl: 86400,
      maxTtl: 31536000,
      minTtl: 1,
      parametersInCacheKeyAndForwardedToOrigin: {
        cookiesConfig: {
          cookieBehavior: "none",
        },
        headersConfig: {
          headerBehavior: "none",
        },
        queryStringsConfig: {
          queryStringBehavior: "none",
        },
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
      },
    }
  },
  ...($dev
    ? {}
    : {
        domain: {
          name: "lydie.co",
          aliases: ["*.lydie.co"],
        },
      }),
});

new sst.aws.StaticSite("Web", {
  path: "./packages/web",
  build: {
    command: "bun run build",
    output: "dist",
  },
  environment: {
    VITE_ZERO_URL: zero.url,
    VITE_API_URL: $dev ? "http://localhost:3001" : "https://api.lydie.co",
  },
  router: {
    instance: frontendRouter,
    ...($dev ? {} : { domain: "cloud.lydie.co" }),
  },
});

new sst.aws.StaticSite("Landing", {
  path: "./packages/landing",
  build: {
    command: "bun run build",
    output: "dist",
  },
  environment: {
    PUBLIC_VITE_API_URL: $dev
      ? "http://localhost:3001"
      : "https://api.lydie.co",
    LYDIE_API_KEY: secret.lydieApiKey.value,
  },
  router: {
    instance: frontendRouter,
    ...($dev ? {} : { domain: "lydie.co" }),
  },
});
