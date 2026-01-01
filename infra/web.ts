/// <reference path="../.sst/platform/config.d.ts" />
import { secret } from "./secret";
import { zero } from "./zero";

// Create S3 bucket for images with CloudFront access
const imagesBucket = new sst.aws.Bucket("Images", {
  access: "cloudfront",
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
    VITE_YJS_SERVER_URL: $dev
      ? "ws://localhost:3001/yjs"
      : "wss://api.lydie.co/yjs",
  },
  ...($dev ? {} : { domain: "app.lydie.co" }),
});

export { imagesBucket };

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
  ...($dev ? {} : { domain: "lydie.co" }),
});
