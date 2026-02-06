import { Resource } from "sst";
import Stripe from "stripe";

export const stripe = new Stripe(Resource.StripeSecretKey.value, {
  apiVersion: "2025-01-27.acacia",
  typescript: true,
});

// Plan configuration
// Each member of a workspace gets these credits based on the workspace tier
export const PLAN_CONFIG = {
  free: {
    name: "Free",
    creditsPerMember: 30,
    pricePerMonth: 0,
    billingInterval: null,
  },
  monthly: {
    name: "Pro Monthly",
    creditsPerMember: 800,
    pricePerMonth: 1800, // $18.00 in cents
    billingInterval: "month",
  },
  yearly: {
    name: "Pro Yearly",
    creditsPerMember: 800,
    pricePerMonth: 1400, // $14.00 in cents (billed yearly)
    billingInterval: "year",
    // Note: Yearly billing means $14 * 12 = $168 per year per member
  },
} as const;

export type PlanType = keyof typeof PLAN_CONFIG;

// Price IDs from environment (to be set in SST secrets)
// Created via Stripe MCP on 2026-02-05:
// Monthly Product: prod_TvNhECrWCBEVo2
// Monthly Price: price_1SxWwI2QnEmaiVg3KtWhPFeZ ($18.00/month per member)
// Yearly Product: prod_TvNh13Jy72rmb1
// Yearly Price: price_1SxWwI2QnEmaiVg3oeTqG2c6 ($168.00/year per member)
export const STRIPE_PRICE_IDS = {
  monthly: Resource.StripeMonthlyPriceId?.value || "price_1SxWwI2QnEmaiVg3KtWhPFeZ",
  yearly: Resource.StripeYearlyPriceId?.value || "price_1SxWwI2QnEmaiVg3oeTqG2c6",
};

// Meter name for credit usage
export const CREDIT_METER_NAME = "credit_usage";

// Credit costs per model (credits per 1k output tokens)
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  "gpt-4o": 10,
  "gpt-4o-mini": 5,
  "gpt-5": 10,
  "gpt-5-mini": 5,
  "gpt-5.2": 10,
  "gemini-2.0-flash": 3,
  "gemini-2.5-flash": 3,
  "gemini-2.5-flash-lite": 2,
  default: 5,
};

/**
 * Calculate credits from output tokens based on model
 */
export function calculateCreditsFromTokens(outputTokens: number, model: string): number {
  const creditCostPer1k = MODEL_CREDIT_COSTS[model] || MODEL_CREDIT_COSTS.default;
  return Math.ceil((outputTokens / 1000) * creditCostPer1k);
}

/**
 * Get plan configuration for a plan type
 */
export function getPlanConfig(plan: PlanType) {
  return PLAN_CONFIG[plan];
}

/**
 * Check if a plan type is valid
 */
export function isValidPlan(plan: string): plan is PlanType {
  return plan in PLAN_CONFIG;
}
