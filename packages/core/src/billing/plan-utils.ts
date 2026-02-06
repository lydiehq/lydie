import { PLAN_TYPES, type PlanType } from "@lydie/database/billing-types";

/**
 * Check if a subscription status represents an active paid plan
 */
export function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Check if a plan type represents a paid (Pro) plan
 */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === "monthly" || plan === "yearly";
}

/**
 * Check if an organization has Pro access
 * This is true for any active paid plan (monthly or yearly)
 */
export function hasProAccess(
  subscriptionPlan: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): boolean {
  return isPaidPlan(subscriptionPlan) && isSubscriptionActive(subscriptionStatus);
}

/**
 * Get the display name for a plan
 */
export function getPlanDisplayName(
  subscriptionPlan: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): string {
  if (hasProAccess(subscriptionPlan, subscriptionStatus)) {
    return "Pro";
  }
  return "Free";
}

/**
 * Get the normalized PlanType from subscription info
 */
export function getPlanType(
  subscriptionPlan: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): PlanType {
  if (isSubscriptionActive(subscriptionStatus)) {
    if (subscriptionPlan === "monthly") {
      return PLAN_TYPES.MONTHLY;
    }
    if (subscriptionPlan === "yearly") {
      return PLAN_TYPES.YEARLY;
    }
  }

  return PLAN_TYPES.FREE;
}
