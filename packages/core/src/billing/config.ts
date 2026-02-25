import Stripe from "stripe";

import { env, requireEnv } from "../env";

const stripeSecretKey = env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2026-01-28.clover",
      typescript: true,
    })
  : null;

// Plan configuration
// Each member of a workspace gets these credits based on the workspace tier
export const PLAN_CONFIG = {
  free: {
    name: "Free",
    creditsPerMember: 150,
    pricePerMonth: 0,
    billingInterval: null,
  },
  monthly: {
    name: "Pro Monthly",
    creditsPerMember: 4000,
    pricePerMonth: 1800, // $18.00 in cents
    billingInterval: "month",
  },
  yearly: {
    name: "Pro Yearly",
    creditsPerMember: 4000,
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
  monthly: env.STRIPE_MONTHLY_PRICE_ID || "price_1SxWwI2QnEmaiVg3KtWhPFeZ",
  yearly: env.STRIPE_YEARLY_PRICE_ID || "price_1SxWwI2QnEmaiVg3oeTqG2c6",
};
