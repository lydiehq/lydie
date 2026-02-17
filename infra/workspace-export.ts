// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

import { organizationAssetsBucket } from "./web";

// Bucket for temporary export files
export const workspaceExportBucket = new sst.aws.Bucket("WorkspaceExports", {
  // TODO: seems like a security risk to have a public bucket
  access: "public",
});

// Lambda function for processing workspace exports
export const workspaceExportProcessorFunction = new sst.aws.Function(
  "WorkspaceExportProcessorFunction",
  {
    handler: "packages/backend/src/handlers/workspace-export.handler",
    timeout: "5 minutes",
    memory: "1024 MB",
    link: [organizationAssetsBucket, workspaceExportBucket],
    permissions: [{ actions: ["s3:GetObject", "s3:PutObject"], resources: ["*"] }],
  },
);

// Linkable resource for Lambda function ARN
export const workspaceExportProcessorFunctionLinkable = new sst.Linkable(
  "WorkspaceExportProcessorFunctionLinkable",
  {
    properties: { arn: workspaceExportProcessorFunction.arn },
  },
);
