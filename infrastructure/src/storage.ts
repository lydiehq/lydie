import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { certificateArn } from "./certificate.js";
import { assetsDomain, stackName } from "./config.js";

// ---------------------------------------------------------------------------
// Assets bucket (organization uploads, images, etc.)
// ---------------------------------------------------------------------------

export const assetsBucket = new aws.s3.Bucket("lydie-assets", {
  bucket: `lydie-${stackName}-assets`,
  tags: { Name: `lydie-assets-${stackName}` },
});

new aws.s3.BucketPublicAccessBlock("lydie-assets-public-access-block", {
  bucket: assetsBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

const assetsOai = new aws.cloudfront.OriginAccessIdentity("lydie-assets-oai", {
  comment: "OAI for Lydie assets bucket",
});

new aws.s3.BucketPolicy("lydie-assets-policy", {
  bucket: assetsBucket.id,
  policy: pulumi.all([assetsBucket.arn, assetsOai.iamArn]).apply(([arn, oaiArn]) =>
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

export const assetsDistribution = new aws.cloudfront.Distribution("lydie-assets-cf", {
  enabled: true,
  isIpv6Enabled: true,
  comment: `Lydie Assets - ${stackName}`,
  aliases: [assetsDomain],
  origins: [
    {
      domainName: assetsBucket.bucketRegionalDomainName,
      originId: "S3-assets",
      s3OriginConfig: {
        originAccessIdentity: assetsOai.cloudfrontAccessIdentityPath,
      },
    },
  ],
  defaultCacheBehavior: {
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD"],
    targetOriginId: "S3-assets",
    forwardedValues: { queryString: false, cookies: { forward: "none" } },
    viewerProtocolPolicy: "redirect-to-https",
    minTtl: 0,
    defaultTtl: 86400,
    maxTtl: 31536000,
  },
  restrictions: { geoRestriction: { restrictionType: "none" } },
  viewerCertificate: {
    acmCertificateArn: certificateArn,
    sslSupportMethod: "sni-only",
    minimumProtocolVersion: "TLSv1.2_2021",
  },
  tags: { Name: `lydie-assets-cf-${stackName}` },
});

export const assetsDistributionDomain = assetsDistribution.domainName;

// ---------------------------------------------------------------------------
// Exports bucket (workspace export zip files — presigned-URL access only)
// ---------------------------------------------------------------------------

export const exportsBucket = new aws.s3.Bucket("lydie-exports", {
  bucket: `lydie-${stackName}-exports`,
  tags: { Name: `lydie-exports-${stackName}` },
});

new aws.s3.BucketPublicAccessBlock("lydie-exports-public-access-block", {
  bucket: exportsBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Re-export bucket identifiers
export const assetsBucketName = assetsBucket.id;
export const exportsBucketName = exportsBucket.id;
