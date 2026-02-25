import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { certificateArn } from "./certificate.js";
import { appDomain, stackName } from "./config.js";

// ---------------------------------------------------------------------------
// Web SPA bucket + CloudFront (app.lydie.co)
// ---------------------------------------------------------------------------

export const webBucket = new aws.s3.Bucket("lydie-web", {
  bucket: `lydie-${stackName}-web`,
  website: { indexDocument: "index.html", errorDocument: "index.html" },
  tags: { Name: `lydie-web-${stackName}` },
});

new aws.s3.BucketPublicAccessBlock("lydie-web-public-access-block", {
  bucket: webBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

const webOai = new aws.cloudfront.OriginAccessIdentity("lydie-web-oai", {
  comment: "OAI for Lydie web bucket",
});

new aws.s3.BucketPolicy("lydie-web-policy", {
  bucket: webBucket.id,
  policy: pulumi.all([webBucket.arn, webOai.iamArn]).apply(([arn, oaiArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontAccess",
          Effect: "Allow",
          Principal: { AWS: oaiArn },
          Action: "s3:GetObject",
          Resource: `${arn}/*`,
        },
      ],
    }),
  ),
});

export const webDistribution = new aws.cloudfront.Distribution("lydie-web-cf", {
  enabled: true,
  isIpv6Enabled: true,
  comment: `Lydie Web SPA - ${stackName}`,
  defaultRootObject: "index.html",
  aliases: [appDomain],
  origins: [
    {
      domainName: webBucket.bucketRegionalDomainName,
      originId: "S3-web",
      s3OriginConfig: {
        originAccessIdentity: webOai.cloudfrontAccessIdentityPath,
      },
    },
  ],
  defaultCacheBehavior: {
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD"],
    targetOriginId: "S3-web",
    forwardedValues: { queryString: true, cookies: { forward: "none" } },
    viewerProtocolPolicy: "redirect-to-https",
    minTtl: 0,
    defaultTtl: 0, // No caching for SPA — html changes on every deploy
    maxTtl: 86400,
  },
  // SPA fallback: serve index.html for 404/403
  customErrorResponses: [
    { errorCode: 404, responseCode: 200, responsePagePath: "/index.html" },
    { errorCode: 403, responseCode: 200, responsePagePath: "/index.html" },
  ],
  restrictions: { geoRestriction: { restrictionType: "none" } },
  viewerCertificate: {
    acmCertificateArn: certificateArn,
    sslSupportMethod: "sni-only",
    minimumProtocolVersion: "TLSv1.2_2021",
  },
  tags: { Name: `lydie-web-cf-${stackName}` },
});
