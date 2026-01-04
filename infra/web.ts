/// <reference path="../.sst/platform/config.d.ts" />
import { secret } from "./secret";
import { zero } from "./zero";

export const organizationAssetsBucket = new sst.aws.Bucket(
  "OrganizationAssets",
  { access: "cloudfront" }
);

export const assetsRouter = new sst.aws.Router("AssetsRouter", {
  domain: "assets.lydie.co",
});

assetsRouter.routeBucket("*", organizationAssetsBucket);

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
    VITE_ASSETS_DOMAIN: assetsRouter.url,
  },
  ...($dev ? {} : { domain: "app.lydie.co" }),
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
  ...($dev ? {} : { domain: "lydie.co" }),
});
