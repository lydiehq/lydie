// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />
import { secret } from "./secret";
import { zero } from "./zero";

export const organizationAssetsBucket = new sst.aws.Bucket("OrganizationAssets", {
  access: "cloudfront",
});

export const assetsRouter = new sst.aws.Router(
  "AssetsRouter",
  $app.stage === "production" ? { domain: "assets.lydie.co" } : {},
);

assetsRouter.routeBucket("*", organizationAssetsBucket);

// Separate CloudFront distribution for PostHog proxy
// Using "e" subdomain (short for "events") to avoid adblockers
// Following PostHog's official CloudFront guide:
// https://posthog.com/docs/advanced/proxy/cloudfront
export const eventsRouter = new sst.aws.Router(
  "EventsRouter",
  $app.stage === "production" 
    ? { 
        domain: "e.lydie.co",
        // Custom cache policy to forward required headers and query strings
        transform: {
          cachePolicy: (args) => {
            args.name = "PostHogCachePolicy";
            args.parametersInCacheKeyAndForwardedToOrigin = {
              headersConfig: {
                headerBehavior: "whitelist",
                headers: {
                  items: ["Origin", "Authorization"],
                },
              },
              queryStringsConfig: {
                queryStringBehavior: "all",
              },
              cookiesConfig: {
                cookieBehavior: "none",
              },
            };
          },
        },
      }
    : {
        transform: {
          cachePolicy: (args) => {
            args.name = "PostHogCachePolicy";
            args.parametersInCacheKeyAndForwardedToOrigin = {
              headersConfig: {
                headerBehavior: "whitelist",
                headers: {
                  items: ["Origin", "Authorization"],
                },
              },
              queryStringsConfig: {
                queryStringBehavior: "all",
              },
              cookiesConfig: {
                cookieBehavior: "none",
              },
            };
          },
        },
      },
);

// Route event/API requests to PostHog main API
// This handles event capture, feature flags, session recordings, etc.
eventsRouter.route("*", "https://us.i.posthog.com", {
  // Use CORS-CustomOrigin which is AWS managed and forwards CORS headers
  // We need to pass headers and query strings properly
});

// Route static assets to PostHog assets CDN
// This serves PostHog's JavaScript SDK and other static files
eventsRouter.route("/static/*", "https://us-assets.i.posthog.com/static");
eventsRouter.route("/array/*", "https://us-assets.i.posthog.com/array");

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
    VITE_POSTHOG_KEY: secret.posthogKey.value,
    VITE_POSTHOG_ENABLE_REPLAY: process.env.POSTHOG_ENABLE_REPLAY || "false",
    // Use e.lydie.co for PostHog to avoid CORS (same root domain)
    VITE_POSTHOG_HOST: $dev ? "http://localhost:3001/ingest" : "https://e.lydie.co",
  },
  ...($dev ? {} : { domain: "app.lydie.co" }),
});

new sst.aws.Astro("Marketing", {
  path: "./packages/marketing",
  environment: {
    PUBLIC_API_URL: $dev ? "http://localhost:3001" : "https://api.lydie.co",
    PUBLIC_ASSETS_DOMAIN: assetsRouter.url,
    PUBLIC_POSTHOG_KEY: secret.posthogKey.value,
    // Use e.lydie.co for PostHog to avoid CORS (same root domain)
    PUBLIC_POSTHOG_HOST: $dev ? "http://localhost:3001/ingest" : "https://e.lydie.co",
  },
  link: [secret.lydieApiKey, secret.postgresConnectionStringDirect, secret.openAiApiKey, secret.posthogKey],
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
