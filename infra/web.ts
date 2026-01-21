/// <reference path="../.sst/platform/config.d.ts" />
import { secret } from "./secret"
import { zero } from "./zero"

export const organizationAssetsBucket = new sst.aws.Bucket("OrganizationAssets", { access: "cloudfront" })

export const assetsRouter = new sst.aws.Router("AssetsRouter", {
  ...($app.stage === "production" ? { domain: "assets.lydie.co" } : {}),
})

assetsRouter.routeBucket("*", organizationAssetsBucket)

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
    VITE_PUBLIC_POSTHOG_KEY: "phc_XczR2cR4b5RKg1SHiagP2w4uFoRYZU80b5M4bcVyudC",
    VITE_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  },
  ...($dev ? {} : { domain: "app.lydie.co" }),
})

new sst.aws.StaticSite("Marketing", {
  path: "./packages/marketing",
  build: {
    command: "bun run build",
    output: "dist",
  },
  environment: {
    PUBLIC_VITE_API_URL: $dev ? "http://localhost:3001" : "https://api.lydie.co",
    LYDIE_API_KEY: secret.lydieApiKey.value,
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
})
