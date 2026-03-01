type AppStage = "development" | "staging" | "production";

function parseAppStage(value: string | undefined): AppStage {
  if (value === "production" || value === "staging" || value === "development") {
    return value;
  }
  return "development";
}

export const env = {
  APP_STAGE: parseAppStage(process.env.APP_STAGE),
  SECURE_COOKIES: process.env.SECURE_COOKIES !== "false",
  BETTER_AUTH_ENABLE_TEST_UTILS: process.env.BETTER_AUTH_ENABLE_TEST_UTILS === "true",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_BASE_URL:
    process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:3001/internal/public/auth",
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_MONTHLY_PRICE_ID: process.env.STRIPE_MONTHLY_PRICE_ID,
  STRIPE_YEARLY_PRICE_ID: process.env.STRIPE_YEARLY_PRICE_ID,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_AI_STUDIO_API_KEY: process.env.GOOGLE_AI_STUDIO_API_KEY,
  S3_BUCKET_ASSETS: process.env.S3_BUCKET_ASSETS,
  ASSETS_PUBLIC_BASE_URL: process.env.ASSETS_PUBLIC_BASE_URL,
  ONBOARDING_LAMBDA_ARN: process.env.ONBOARDING_LAMBDA_ARN,
  ONBOARDING_SCHEDULER_ROLE_ARN: process.env.ONBOARDING_SCHEDULER_ROLE_ARN,
} as const;

export function requireEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}
