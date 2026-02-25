import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { certificateArn } from "./certificate.js";
import { eventsDomain, stackName } from "./config.js";

// ---------------------------------------------------------------------------
// PostHog reverse-proxy CloudFront distribution (e.lydie.co)
//
// Proxies analytics traffic to PostHog US servers so that ad-blockers
// don't block first-party requests.
// ---------------------------------------------------------------------------

// Cache policy: forward Origin + Authorization headers, all query strings
const posthogCachePolicy = new aws.cloudfront.CachePolicy("posthog-cache-policy", {
  name: `lydie-posthog-${stackName}`,
  comment: "PostHog proxy — forward required headers and query strings",
  defaultTtl: 0,
  maxTtl: 86400,
  minTtl: 0,
  parametersInCacheKeyAndForwardedToOrigin: {
    headersConfig: {
      headerBehavior: "whitelist",
      headers: { items: ["Origin", "Authorization"] },
    },
    queryStringsConfig: { queryStringBehavior: "all" },
    cookiesConfig: { cookieBehavior: "none" },
  },
});

// Origin request policy: forward all headers to PostHog so it works correctly
const posthogOriginRequestPolicy = new aws.cloudfront.OriginRequestPolicy(
  "posthog-origin-request-policy",
  {
    name: `lydie-posthog-origin-${stackName}`,
    comment: "Forward all viewer headers to PostHog origin",
    headersConfig: {
      headerBehavior: "allViewer",
    },
    queryStringsConfig: { queryStringBehavior: "all" },
    cookiesConfig: { cookieBehavior: "none" },
  },
);

export const eventsDistribution = new aws.cloudfront.Distribution("lydie-events-cf", {
  enabled: true,
  isIpv6Enabled: true,
  comment: `Lydie PostHog Proxy - ${stackName}`,
  aliases: [eventsDomain],
  origins: [
    {
      domainName: "us.i.posthog.com",
      originId: "posthog",
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: "https-only",
        originSslProtocols: ["TLSv1.2"],
      },
    },
    {
      domainName: "us-assets.i.posthog.com",
      originId: "posthog-assets",
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: "https-only",
        originSslProtocols: ["TLSv1.2"],
      },
    },
  ],
  // Default: proxy to posthog ingest
  defaultCacheBehavior: {
    allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
    cachedMethods: ["GET", "HEAD"],
    targetOriginId: "posthog",
    cachePolicyId: posthogCachePolicy.id,
    originRequestPolicyId: posthogOriginRequestPolicy.id,
    viewerProtocolPolicy: "redirect-to-https",
  },
  // Static assets and JS bundles come from posthog-assets origin
  orderedCacheBehaviors: [
    {
      pathPattern: "/static/*",
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD"],
      targetOriginId: "posthog-assets",
      cachePolicyId: posthogCachePolicy.id,
      originRequestPolicyId: posthogOriginRequestPolicy.id,
      viewerProtocolPolicy: "redirect-to-https",
    },
    {
      pathPattern: "/array/*",
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD"],
      targetOriginId: "posthog-assets",
      cachePolicyId: posthogCachePolicy.id,
      originRequestPolicyId: posthogOriginRequestPolicy.id,
      viewerProtocolPolicy: "redirect-to-https",
    },
  ],
  restrictions: { geoRestriction: { restrictionType: "none" } },
  viewerCertificate: {
    acmCertificateArn: certificateArn,
    sslSupportMethod: "sni-only",
    minimumProtocolVersion: "TLSv1.2_2021",
  },
  tags: { Name: `lydie-events-cf-${stackName}` },
});
