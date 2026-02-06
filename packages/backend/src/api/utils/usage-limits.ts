import { checkAndConsumeCredits, getUserCreditStatus } from "@lydie/core/billing/workspace-credits";
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
 * This checks the specific user's credit balance in the workspace
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
  const currentPlan = getCurrentPlan(params.subscriptionPlan, params.subscriptionStatus);

  // Get the current credit status for this user in this workspace
  const creditStatus = await getUserCreditStatus(params.userId, params.organizationId);

  if (!creditStatus) {
    return {
      allowed: false,
      creditsAvailable: 0,
      creditsRequired: 1,
      currentPlan,
    };
  }

  return {
    allowed: creditStatus.creditsAvailable > 0,
    creditsAvailable: creditStatus.creditsAvailable,
    creditsRequired: 1,
    currentPlan,
  };
}

/**
 * Consume credits for an AI operation
 */
export async function consumeCredits(params: {
  organizationId: string;
  userId: string;
  creditsRequested: number;
  actionType: string;
  resourceId?: string;
}) {
  return checkAndConsumeCredits(
    params.userId,
    params.organizationId,
    params.creditsRequested,
    params.actionType,
    params.resourceId,
  );
}

/**
 * Get the user's credit status in a workspace
 */
export async function getUserCreditStatusInWorkspace(userId: string, organizationId: string) {
  return getUserCreditStatus(userId, organizationId);
}
