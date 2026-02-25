import * as aws from "@pulumi/aws";

import { hostedZone } from "./certificate.js";
import {
  apiDomain,
  appDomain,
  assetsDomain,
  eventsDomain,
  zeroDomain,
} from "./config.js";
import { eventsDistribution } from "./events.js";
import { albDnsName, albZoneId } from "./services.js";
import { assetsDistribution } from "./storage.js";
import { webDistribution } from "./web.js";

// ---------------------------------------------------------------------------
// Helper — create an A-record alias pointing to a CloudFront distribution
// ---------------------------------------------------------------------------

function cfAlias(
  name: string,
  recordName: string,
  distribution: aws.cloudfront.Distribution,
) {
  return new aws.route53.Record(name, {
    zoneId: hostedZone.then((z) => z.zoneId),
    name: recordName,
    type: "A",
    aliases: [
      {
        name: distribution.domainName,
        zoneId: distribution.hostedZoneId,
        evaluateTargetHealth: false,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Helper — create an A-record alias pointing to the ALB
// ---------------------------------------------------------------------------

function albAlias(name: string, recordName: string) {
  return new aws.route53.Record(name, {
    zoneId: hostedZone.then((z) => z.zoneId),
    name: recordName,
    type: "A",
    aliases: [
      {
        name: albDnsName,
        zoneId: albZoneId,
        evaluateTargetHealth: true,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// DNS Records
// ---------------------------------------------------------------------------

// app.lydie.co -> Web SPA CloudFront
export const appRecord = cfAlias("lydie-app", appDomain, webDistribution);

// api.lydie.co -> ALB (backend ECS service)
export const apiRecord = albAlias("lydie-api", apiDomain);

// zero.lydie.co -> ALB (zero ECS service)
export const zeroRecord = albAlias("lydie-zero", zeroDomain);

// assets.lydie.co -> Assets CloudFront
export const assetsRecord = cfAlias("lydie-assets", assetsDomain, assetsDistribution);

// e.lydie.co -> PostHog proxy CloudFront
export const eventsRecord = cfAlias("lydie-events", eventsDomain, eventsDistribution);

// NOTE: lydie.co (marketing/root domain) is NOT managed here.
// The Astro marketing site should be deployed separately (e.g., Vercel,
// Cloudflare Pages, or a dedicated CloudFront distribution added later).
