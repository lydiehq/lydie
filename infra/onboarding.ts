// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

import { secret } from "./secret"

export const onboardingEmailProcessorFunction = new sst.aws.Function("OnboardingEmailProcessorFunction", {
  handler: "packages/backend/src/handlers/onboarding.handler",
  timeout: "30 seconds",
  link: [secret.postgresConnectionStringPooled],
  permissions: [
    { actions: ["ses:SendEmail"], resources: ["*"] },
    { actions: ["scheduler:DeleteSchedule"], resources: ["*"] },
  ],
})

// IAM role for EventBridge Scheduler to invoke the Lambda
export const onboardingSchedulerRole = new aws.iam.Role("OnboardingSchedulerRole", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "scheduler.amazonaws.com",
  }),
})

// Linkable resource for Lambda function ARN
export const onboardingEmailProcessorFunctionLinkable = new sst.Linkable(
  "OnboardingEmailProcessorFunctionLinkable",
  {
    properties: { arn: onboardingEmailProcessorFunction.arn },
  },
)

// Linkable resource for IAM role ARN
export const onboardingSchedulerRoleLinkable = new sst.Linkable("OnboardingSchedulerRoleLinkable", {
  properties: { arn: onboardingSchedulerRole.arn },
})

new aws.iam.RolePolicy("OnboardingSchedulerPolicy", {
  role: onboardingSchedulerRole.id,
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["lambda:InvokeFunction"],
        Resource: [onboardingEmailProcessorFunction.arn],
      },
    ],
  },
})

new aws.lambda.Permission("OnboardingSchedulerInvokePermission", {
  action: "lambda:InvokeFunction",
  function: onboardingEmailProcessorFunction.arn,
  principal: "scheduler.amazonaws.com",
})
