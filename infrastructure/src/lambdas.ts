import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { stackName } from "./config.js";
import { assetsBucket, exportsBucket } from "./storage.js";
import { databaseUrl } from "./database.js";

// ---------------------------------------------------------------------------
// Onboarding email scheduler Lambda
//
// Mirrors infra/onboarding.ts from the old SST stack.
// Invoked by EventBridge Scheduler to send drip emails after signup.
// ---------------------------------------------------------------------------

const onboardingLogGroup = new aws.cloudwatch.LogGroup("lydie-onboarding-logs", {
  name: `/aws/lambda/lydie-onboarding-${stackName}`,
  retentionInDays: 14,
});

const onboardingRole = new aws.iam.Role("lydie-onboarding-lambda-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
    ],
  }),
  managedPolicyArns: [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  ],
});

new aws.iam.RolePolicy("lydie-onboarding-lambda-policy", {
  role: onboardingRole.id,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["ses:SendEmail", "ses:SendRawEmail"], Resource: "*" },
      { Effect: "Allow", Action: ["scheduler:DeleteSchedule"], Resource: "*" },
    ],
  }),
});

export const onboardingFunction = new aws.lambda.Function("lydie-onboarding", {
  name: `lydie-onboarding-${stackName}`,
  runtime: "nodejs20.x",
  handler: "index.handler",
  role: onboardingRole.arn,
  timeout: 30,
  memorySize: 256,
  // The code is deployed separately via CI/CD (zip upload or ECR image).
  // Placeholder package — replaced on first deploy.
  code: new pulumi.asset.AssetArchive({
    "index.mjs": new pulumi.asset.StringAsset(
      'export const handler = async () => ({ statusCode: 200, body: "placeholder" });',
    ),
  }),
  environment: {
    variables: {
      APP_STAGE: stackName,
      DATABASE_URL: databaseUrl,
    },
  },
  tags: { Name: `lydie-onboarding-${stackName}` },
});

// ---------------------------------------------------------------------------
// EventBridge Scheduler IAM role
//
// The backend creates EventBridge schedules that invoke the onboarding Lambda.
// This role is passed to scheduler:CreateSchedule as the TargetRoleArn.
// ---------------------------------------------------------------------------

export const schedulerRole = new aws.iam.Role("lydie-scheduler-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "scheduler.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicy("lydie-scheduler-invoke-policy", {
  role: schedulerRole.id,
  policy: onboardingFunction.arn.apply((arn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: "lambda:InvokeFunction", Resource: arn },
      ],
    }),
  ),
});

// Allow EventBridge Scheduler to invoke the Lambda
new aws.lambda.Permission("lydie-scheduler-invoke-permission", {
  action: "lambda:InvokeFunction",
  function: onboardingFunction.arn,
  principal: "scheduler.amazonaws.com",
});

// ---------------------------------------------------------------------------
// Workspace export processor Lambda
//
// Mirrors infra/workspace-export.ts from the old SST stack.
// Invoked by the backend to assemble export zip files.
// ---------------------------------------------------------------------------

const exportLogGroup = new aws.cloudwatch.LogGroup("lydie-export-logs", {
  name: `/aws/lambda/lydie-export-${stackName}`,
  retentionInDays: 14,
});

const exportRole = new aws.iam.Role("lydie-export-lambda-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
    ],
  }),
  managedPolicyArns: [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  ],
});

new aws.iam.RolePolicy("lydie-export-lambda-policy", {
  role: exportRole.id,
  policy: pulumi.all([assetsBucket.arn, exportsBucket.arn]).apply(([assetsArn, exportsArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject"],
          Resource: [`${assetsArn}/*`, `${exportsArn}/*`],
        },
      ],
    }),
  ),
});

export const exportFunction = new aws.lambda.Function("lydie-export", {
  name: `lydie-export-${stackName}`,
  runtime: "nodejs20.x",
  handler: "index.handler",
  role: exportRole.arn,
  timeout: 300, // 5 minutes
  memorySize: 1024,
  code: new pulumi.asset.AssetArchive({
    "index.mjs": new pulumi.asset.StringAsset(
      'export const handler = async () => ({ statusCode: 200, body: "placeholder" });',
    ),
  }),
  environment: {
    variables: {
      APP_STAGE: stackName,
      S3_BUCKET_ASSETS: assetsBucket.id,
      S3_BUCKET_EXPORTS: exportsBucket.id,
    },
  },
  tags: { Name: `lydie-export-${stackName}` },
});

// Export ARNs for use by services.ts (backend needs to invoke these + pass scheduler role)
export const onboardingFunctionArn = onboardingFunction.arn;
export const exportFunctionArn = exportFunction.arn;
export const schedulerRoleArn = schedulerRole.arn;
