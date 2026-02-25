type AppStage = "development" | "staging" | "production";

function parseAppStage(value: string | undefined): AppStage {
  if (value === "production" || value === "staging" || value === "development") {
    return value;
  }

  return "development";
}

export const env = {
  APP_STAGE: parseAppStage(process.env.APP_STAGE),
  SENTRY_DSN: process.env.SENTRY_DSN,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  S3_BUCKET_ASSETS: process.env.S3_BUCKET_ASSETS,
  ASSETS_PUBLIC_BASE_URL: process.env.ASSETS_PUBLIC_BASE_URL,
  S3_BUCKET_EXPORTS: process.env.S3_BUCKET_EXPORTS,
} as const;

export function requireEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}
