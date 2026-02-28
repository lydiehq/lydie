// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />
import { eventsRouter } from "./events";
import { zero } from "./zero";

export const organizationAssetsBucket = new sst.aws.Bucket("OrganizationAssets", {
  access: "cloudfront",
});

export const assetsRouter = new sst.aws.Router(
  "AssetsRouter",
  $app.stage === "production" ? { domain: "assets.lydie.co" } : {},
);

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
    VITE_YJS_SERVER_URL: $dev ? "ws://localhost:3001/yjs" : "wss://api.lydie.co/yjs",
    VITE_ASSETS_DOMAIN: assetsRouter.url,
    VITE_POSTHOG_KEY: process.env.POSTHOG_KEY,
    VITE_POSTHOG_ENABLE_REPLAY: process.env.POSTHOG_ENABLE_REPLAY || "false",
    VITE_POSTHOG_HOST: "https://e.lydie.co",
  },
  ...($dev ? {} : { domain: "app.lydie.co" }),
});

new sst.aws.Astro("Marketing", {
  path: "./packages/marketing",
  environment: {
    PUBLIC_API_URL: $dev ? "http://localhost:3001" : "https://api.lydie.co",
    PUBLIC_ASSETS_DOMAIN: assetsRouter.url,
    PUBLIC_POSTHOG_KEY: process.env.POSTHOG_KEY,
    PUBLIC_POSTHOG_HOST: "https://e.lydie.co",
    LYDIE_API_KEY: process.env.LYDIE_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
  ...($dev ? {} : { domain: "lydie.co" }),
  ...($dev
    ? {}
    : {
        edge: {
          viewerRequest: {
            injection: `var uri = event.request.uri;
var cookies = event.request.cookies;
var isRoot = uri === '/' || uri === '/index.html';
var hasToken = cookies && (
  (cookies['better-auth.session_token'] && cookies['better-auth.session_token'].value) ||
  (cookies['__Secure-better-auth.session_token'] && cookies['__Secure-better-auth.session_token'].value)
);
if (isRoot && hasToken) {
  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: { 'location': { value: 'https://app.lydie.co' } }
  };
}`,
          },
        },
      }),
});
