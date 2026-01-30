import { checkSeatCreditBalance, getOrganizationCreditBalance } from "@lydie/core/billing/polar-credits";
import { PLAN_TYPES, type PlanType } from "@lydie/database/billing-types";

// Get the current plan for an organization
function getCurrentPlan(
  subscriptionPlan?: string | null,
  subscriptionStatus?: string | null,
): PlanType {
  if (subscriptionStatus === "active") {
    if (subscriptionPlan === "monthly") {
      return PLAN_TYPES.MONTHLY;
    }
    if (subscriptionPlan === "yearly") {
      return PLAN_TYPES.YEARLY;
    }
  }

  return PLAN_TYPES.FREE;
}

/**
 * Check if a user has sufficient credits for AI operations
 * This is the per-seat version that checks the specific user's credit balance
 */
export async function checkCreditBalance(params: {
  organizationId: string;
  userId: string;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
}): Promise<{
  allowed: boolean;
  creditsAvailable: number;
  creditsRequired: number;
  currentPlan: PlanType;
}> {
  const currentPlan = getCurrentPlan(
    params.subscriptionPlan,
    params.subscriptionStatus,
  );

  // Get the current credit balance from Polar for this specific seat/user
  const creditCheck = await checkSeatCreditBalance(
    params.organizationId,
    params.userId,
    1 // Require at least 1 credit
  );

  return {
    allowed: creditCheck.allowed,
    creditsAvailable: creditCheck.creditsAvailable,
    creditsRequired: creditCheck.creditsRequired,
    currentPlan,
  };
}

/**
 * Get the total organization credit balance across all seats
 * This is useful for organization-level reporting
 */
export async function getOrganizationTotalCredits(organizationId: string): Promise<number> {
  return getOrganizationCreditBalance(organizationId);
}
