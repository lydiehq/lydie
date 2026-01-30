import { getCreditBalance } from "@lydie/core/polar-credits";
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
 * Check if an organization has sufficient credits for AI operations
 * @param organization - The organization to check
 * @param requiredCredits - Minimum credits required (default: 1)
 * @returns Object with allowed status and credit info
 */
export async function checkCreditBalance(organization: {
  id: string;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
}): Promise<{
  allowed: boolean;
  creditsAvailable: number;
  creditsRequired: number;
  currentPlan: PlanType;
}> {
  const currentPlan = getCurrentPlan(
    organization.subscriptionPlan,
    organization.subscriptionStatus,
  );

  // Get the current credit balance from Polar (with sync)
  const creditsAvailable = await getCreditBalance(organization.id, true);

  // Require at least 1 credit for AI operations
  const creditsRequired = 1;
  const allowed = creditsAvailable >= creditsRequired;

  return {
    allowed,
    creditsAvailable,
    creditsRequired,
    currentPlan,
  };
}
