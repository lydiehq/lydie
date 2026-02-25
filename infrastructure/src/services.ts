import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

import { certificateArn } from "./certificate.js";
import {
  apiDomain,
  appDomain,
  assetsDomain,
  backendCpu,
  backendMemory,
  domainName,
  isProduction,
  stackName,
  zeroCpu,
  zeroDomain,
  zeroMemory,
} from "./config.js";
import { databaseUrl, databaseUrlDirect } from "./database.js";
import { sesConfigSetName } from "./email.js";
import {
  exportFunctionArn,
  onboardingFunctionArn,
  schedulerRoleArn,
} from "./lambdas.js";
import * as secrets from "./secrets.js";
import { assetsBucket, exportsBucket } from "./storage.js";
import { privateSubnetIds, publicSubnetIds, vpcId } from "./vpc.js";

// ---------------------------------------------------------------------------
// ECR Repositories (awsx adds lifecycle policies automatically)
// ---------------------------------------------------------------------------

export const backendEcrRepo = new awsx.ecr.Repository("lydie-backend-ecr", {
  name: `lydie-backend-${stackName}`,
  imageScanningConfiguration: { scanOnPush: true },
  forceDelete: !isProduction,
});

export const zeroEcrRepo = new awsx.ecr.Repository("lydie-zero-ecr", {
  name: `lydie-zero-${stackName}`,
  imageScanningConfiguration: { scanOnPush: true },
  forceDelete: !isProduction,
});

export const backendEcrRepoUrl = backendEcrRepo.url;
export const zeroEcrRepoUrl = zeroEcrRepo.url;

// ---------------------------------------------------------------------------
// ECS Cluster
// ---------------------------------------------------------------------------

export const cluster = new aws.ecs.Cluster("lydie-cluster", {
  name: `lydie-${stackName}`,
  settings: [
    { name: "containerInsights", value: isProduction ? "enabled" : "disabled" },
  ],
});

// ---------------------------------------------------------------------------
// Application Load Balancer (awsx auto-creates security group + default TG)
// ---------------------------------------------------------------------------

const alb = new awsx.lb.ApplicationLoadBalancer("lydie-alb", {
  name: `lydie-${stackName}`,
  subnetIds: publicSubnetIds,
  enableDeletionProtection: isProduction,
  defaultSecurityGroup: {
    args: {
      vpcId,
      ingress: [
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
        { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
      ],
      egress: [
        { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
      ],
    },
  },
  listeners: [
    {
      port: 443,
      protocol: "HTTPS",
      sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      certificateArn,
      defaultActions: [
        {
          type: "fixed-response",
          fixedResponse: {
            contentType: "text/plain",
            messageBody: "Not Found",
            statusCode: "404",
          },
        },
      ],
    },
    {
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "redirect",
          redirect: { port: "443", protocol: "HTTPS", statusCode: "HTTP_301" },
        },
      ],
    },
  ],
  tags: { Name: `lydie-alb-${stackName}` },
});

// ECS security group — allows all traffic from the ALB SG
const ecsSg = new aws.ec2.SecurityGroup("lydie-ecs-sg", {
  name: `lydie-ecs-${stackName}`,
  vpcId,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 0,
      toPort: 65535,
      securityGroups: [alb.defaultSecurityGroup.apply((sg) => sg!.id)],
    },
  ],
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
  tags: { Name: `lydie-ecs-sg-${stackName}` },
});

// ---------------------------------------------------------------------------
// Target Groups + Listener Rules (host-based routing)
// ---------------------------------------------------------------------------

const backendTg = new aws.lb.TargetGroup("lydie-backend-tg", {
  name: `lydie-be-${stackName}`,
  port: 3001,
  protocol: "HTTP",
  vpcId,
  targetType: "ip",
  healthCheck: {
    enabled: true,
    healthyThreshold: 2,
    interval: 30,
    matcher: "200",
    path: "/",
    port: "traffic-port",
    protocol: "HTTP",
    timeout: 5,
    unhealthyThreshold: 3,
  },
  stickiness: { type: "lb_cookie", cookieDuration: 86400, enabled: true },
});

const zeroTg = new aws.lb.TargetGroup("lydie-zero-tg", {
  name: `lydie-zero-${stackName}`,
  port: 4848,
  protocol: "HTTP",
  vpcId,
  targetType: "ip",
  healthCheck: {
    enabled: true,
    healthyThreshold: 2,
    interval: 30,
    matcher: "200",
    path: "/keepalive",
    port: "traffic-port",
    protocol: "HTTP",
    timeout: 5,
    unhealthyThreshold: 3,
  },
  stickiness: { type: "lb_cookie", cookieDuration: 120, enabled: true },
});

// The HTTPS listener is the first in the array
const httpsListenerArn = alb.listeners.apply((listeners) => listeners![0].arn);

new aws.lb.ListenerRule("lydie-api-rule", {
  listenerArn: httpsListenerArn,
  priority: 100,
  conditions: [{ hostHeader: { values: [apiDomain] } }],
  actions: [{ type: "forward", targetGroupArn: backendTg.arn }],
});

new aws.lb.ListenerRule("lydie-zero-rule", {
  listenerArn: httpsListenerArn,
  priority: 200,
  conditions: [{ hostHeader: { values: [zeroDomain] } }],
  actions: [{ type: "forward", targetGroupArn: zeroTg.arn }],
});

// ---------------------------------------------------------------------------
// IAM — Task Role (application-specific permissions)
// Execution role is auto-created by awsx.ecs.FargateService.
// ---------------------------------------------------------------------------

const taskRole = new aws.iam.Role("lydie-task-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicy("lydie-task-policy", {
  role: taskRole.id,
  policy: pulumi
    .all([assetsBucket.arn, exportsBucket.arn, onboardingFunctionArn, exportFunctionArn, schedulerRoleArn])
    .apply(([assetsArn, exportsArn, onboardingArn, exportArn, schedRoleArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            Resource: [`${assetsArn}/*`, `${exportsArn}/*`],
          },
          {
            Effect: "Allow",
            Action: ["ses:SendEmail", "ses:SendRawEmail"],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["scheduler:CreateSchedule", "scheduler:DeleteSchedule"],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: "iam:PassRole",
            Resource: schedRoleArn,
          },
          {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: [onboardingArn, exportArn],
          },
        ],
      }),
    ),
});

// ---------------------------------------------------------------------------
// Backend — Fargate Service (awsx auto-creates task def, execution role, log group)
// ---------------------------------------------------------------------------

const backendEnv: pulumi.Input<awsx.types.input.ecs.TaskDefinitionKeyValuePairArgs>[] = [
  { name: "APP_STAGE", value: stackName },
  { name: "APP_ENV", value: "aws" },
  { name: "NODE_ENV", value: isProduction ? "production" : "development" },
  { name: "FRONTEND_URL", value: `https://${appDomain}` },
  { name: "S3_BUCKET_ASSETS", value: assetsBucket.id },
  { name: "ASSETS_PUBLIC_BASE_URL", value: `https://${assetsDomain}` },
  { name: "S3_BUCKET_EXPORTS", value: exportsBucket.id },
  { name: "S3_REGION", value: "us-east-1" },
  { name: "EMAIL_PROVIDER", value: "ses" },
  { name: "EMAIL_FROM", value: `no-reply@${domainName}` },
  { name: "EMAIL_FROM_NAME", value: "Lydie" },
  { name: "ZERO_URL", value: `https://${zeroDomain}` },
  { name: "ZERO_MUTATE_URL", value: `https://${apiDomain}/internal/zero/mutate` },
  { name: "ZERO_QUERY_URL", value: `https://${apiDomain}/internal/zero/queries` },
  { name: "SCHEDULER_PROVIDER", value: isProduction ? "aws-eventbridge" : "memory" },
  // Secrets (from Pulumi config, not AWS Secrets Manager)
  { name: "DATABASE_URL", value: databaseUrl },
  { name: "DATABASE_URL_DIRECT", value: databaseUrlDirect },
  { name: "BETTER_AUTH_SECRET", value: secrets.betterAuthSecret },
  { name: "GOOGLE_AI_STUDIO_API_KEY", value: secrets.googleAiStudioApiKey },
  { name: "OPENAI_API_KEY", value: secrets.openAiApiKey },
  { name: "GOOGLE_CLIENT_ID", value: secrets.googleClientId },
  { name: "GOOGLE_CLIENT_SECRET", value: secrets.googleClientSecret },
  { name: "STRIPE_SECRET_KEY", value: secrets.stripeSecretKey },
  { name: "STRIPE_MONTHLY_PRICE_ID", value: secrets.stripeMonthlyPriceId },
  { name: "STRIPE_YEARLY_PRICE_ID", value: secrets.stripeYearlyPriceId },
  { name: "STRIPE_WEBHOOK_SECRET", value: secrets.stripeWebhookSecret },
  { name: "GITHUB_CLIENT_ID", value: secrets.githubClientId },
  { name: "GITHUB_CLIENT_SECRET", value: secrets.githubClientSecret },
  { name: "GITHUB_PRIVATE_KEY", value: secrets.githubPrivateKey },
  { name: "GITHUB_APP_SLUG", value: secrets.githubAppSlug },
  { name: "SHOPIFY_CLIENT_ID", value: secrets.shopifyClientId },
  { name: "SHOPIFY_CLIENT_SECRET", value: secrets.shopifyClientSecret },
  { name: "API_GATEWAY_KEY", value: secrets.apiGatewayKey },
  { name: "SENTRY_DSN", value: secrets.sentryDsn },
  { name: "POSTHOG_KEY", value: secrets.posthogKey },
  // Lambda ARNs for backend to invoke
  { name: "ONBOARDING_FUNCTION_ARN", value: onboardingFunctionArn },
  { name: "EXPORT_FUNCTION_ARN", value: exportFunctionArn },
  { name: "SCHEDULER_ROLE_ARN", value: schedulerRoleArn },
];

const backendService = new awsx.ecs.FargateService("lydie-backend", {
  name: `lydie-backend-${stackName}`,
  cluster: cluster.arn,
  desiredCount: isProduction ? 2 : 1,
  healthCheckGracePeriodSeconds: 60,
  assignPublicIp: false,
  networkConfiguration: {
    subnets: privateSubnetIds,
    securityGroups: [ecsSg.id],
  },
  loadBalancers: [
    { targetGroupArn: backendTg.arn, containerName: "backend", containerPort: 3001 },
  ],
  taskDefinitionArgs: {
    cpu: backendCpu.toString(),
    memory: backendMemory.toString(),
    taskRole: { roleArn: taskRole.arn },
    logGroup: {
      args: {
        name: `/ecs/lydie-backend-${stackName}`,
        retentionInDays: isProduction ? 30 : 7,
      },
    },
    container: {
      name: "backend",
      image: pulumi.interpolate`${backendEcrRepo.url}:latest`,
      essential: true,
      portMappings: [{ containerPort: 3001 }],
      environment: backendEnv,
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:3001/ || exit 1"],
        interval: 30,
        timeout: 5,
        retries: 3,
        startPeriod: 60,
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Zero — Fargate Service
// ---------------------------------------------------------------------------

const zeroEnv: pulumi.Input<awsx.types.input.ecs.TaskDefinitionKeyValuePairArgs>[] = [
  { name: "APP_STAGE", value: stackName },
  { name: "APP_ENV", value: "aws" },
  { name: "ZERO_NUM_SYNC_WORKERS", value: "4" },
  { name: "ZERO_MUTATE_FORWARD_COOKIES", value: "true" },
  { name: "ZERO_QUERY_FORWARD_COOKIES", value: "true" },
  { name: "ZERO_APP_PUBLICATIONS", value: "zero_data" },
  { name: "ZERO_MUTATE_URL", value: `https://${apiDomain}/internal/zero/mutate` },
  { name: "ZERO_QUERY_URL", value: `https://${apiDomain}/internal/zero/queries` },
  // Secrets
  { name: "ZERO_ADMIN_PASSWORD", value: secrets.zeroAdminPassword },
  { name: "ZERO_UPSTREAM_DB", value: databaseUrl },
  { name: "ZERO_CVR_DB", value: databaseUrl },
  { name: "ZERO_CHANGE_DB", value: databaseUrl },
];

const zeroService = new awsx.ecs.FargateService("lydie-zero", {
  name: `lydie-zero-${stackName}`,
  cluster: cluster.arn,
  desiredCount: 1,
  healthCheckGracePeriodSeconds: 900,
  assignPublicIp: false,
  networkConfiguration: {
    subnets: privateSubnetIds,
    securityGroups: [ecsSg.id],
  },
  loadBalancers: [
    { targetGroupArn: zeroTg.arn, containerName: "zero", containerPort: 4848 },
  ],
  taskDefinitionArgs: {
    cpu: zeroCpu.toString(),
    memory: zeroMemory.toString(),
    taskRole: { roleArn: taskRole.arn },
    logGroup: {
      args: {
        name: `/ecs/lydie-zero-${stackName}`,
        retentionInDays: isProduction ? 30 : 7,
      },
    },
    container: {
      name: "zero",
      image: pulumi.interpolate`${zeroEcrRepo.url}:latest`,
      essential: true,
      portMappings: [{ containerPort: 4848 }],
      environment: zeroEnv,
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:4848/ || exit 1"],
        interval: 30,
        timeout: 5,
        retries: 3,
        startPeriod: 300,
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Auto Scaling — Backend
// ---------------------------------------------------------------------------

const backendScalingTarget = new aws.appautoscaling.Target("lydie-backend-scaling", {
  maxCapacity: isProduction ? 4 : 2,
  minCapacity: isProduction ? 2 : 1,
  resourceId: pulumi.interpolate`service/${cluster.name}/${backendService.service.apply((s) => s.name)}`,
  scalableDimension: "ecs:service:DesiredCount",
  serviceNamespace: "ecs",
});

new aws.appautoscaling.Policy("lydie-backend-scaling-policy", {
  name: `lydie-backend-cpu-${stackName}`,
  policyType: "TargetTrackingScaling",
  resourceId: backendScalingTarget.resourceId,
  scalableDimension: backendScalingTarget.scalableDimension,
  serviceNamespace: backendScalingTarget.serviceNamespace,
  targetTrackingScalingPolicyConfiguration: {
    predefinedMetricSpecification: {
      predefinedMetricType: "ECSServiceAverageCPUUtilization",
    },
    targetValue: 70,
    scaleInCooldown: 300,
    scaleOutCooldown: 60,
  },
});

// ---------------------------------------------------------------------------
// Exports for dns.ts
// ---------------------------------------------------------------------------

export const albDnsName = alb.loadBalancer.dnsName;
export const albZoneId = alb.loadBalancer.zoneId;
