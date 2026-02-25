// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

export const onboardingEmailProcessorFunction = new sst.aws.Function(
  "OnboardingEmailProcessorFunction",
  {
    handler: "packages/backend/src/handlers/onboarding.handler",
    timeout: "30 seconds",
    environment: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      APP_STAGE: $app.stage === "production" ? "production" : "development",
    },
    permissions: [
      { actions: ["ses:SendEmail"], resources: ["*"] },
      { actions: ["scheduler:DeleteSchedule"], resources: ["*"] },
    ],
  },
);

// IAM role for EventBridge Scheduler to invoke the Lambda
export const onboardingSchedulerRole = new aws.iam.Role("OnboardingSchedulerRole", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "scheduler.amazonaws.com",
  }),
});

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
});

new aws.lambda.Permission("OnboardingSchedulerInvokePermission", {
  action: "lambda:InvokeFunction",
  function: onboardingEmailProcessorFunction.arn,
  principal: "scheduler.amazonaws.com",
});
