import { db, schema } from "@lydie/database";
import { eq, and, sql } from "drizzle-orm";

import { stripe, PLAN_CONFIG, type PlanType } from "./config";

/**
 * Get or create a Stripe customer for a user
 */
export async function getOrCreateStripeCustomer(userId: string, email: string) {
  // Check if customer already exists
  const existingCustomer = await db.query.stripeCustomersTable.findFirst({
    where: { userId },
  });

  if (existingCustomer) {
    return existingCustomer;
  }

  // Create new Stripe customer
  const stripeCustomer = await stripe.customers.create({
    email,
    metadata: {
      userId,
    },
  });

  // Store in database
  await db.insert(schema.stripeCustomersTable).values({
    id: stripeCustomer.id,
    userId,
    email,
  });

  return {
    id: stripeCustomer.id,
    userId,
    email,
  };
}

/**
 * Get workspace billing information
 */
export async function getWorkspaceBilling(organizationId: string) {
  const billing = await db.query.workspaceBillingTable.findFirst({
    where: {
      organizationId,
    },
    with: {
      billingOwner: true,
    },
  });

  return billing;
}

/**
 * Get or create credit record for a user in a workspace
 * Credits are per-user-per-workspace (not shared)
 */
export async function getOrCreateUserWorkspaceCredits(userId: string, organizationId: string) {
  // Check if credit record exists
  let credits = await db.query.userWorkspaceCreditsTable.findFirst({
    where: {
      AND: [
        {
          userId,
        },
        { organizationId },
      ],
    },
  });

  if (credits) {
    return credits;
  }

  // Get workspace plan to determine credits
  const billing = await getWorkspaceBilling(organizationId);
  const planConfig = PLAN_CONFIG[billing?.plan as PlanType] || PLAN_CONFIG.free;

  // Create new credit record
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);

  await db.insert(schema.userWorkspaceCreditsTable).values({
    userId,
    organizationId,
    creditsIncludedMonthly: planConfig.creditsPerMember,
    creditsAvailable: planConfig.creditsPerMember,
    creditsUsedThisPeriod: 0,
    currentPeriodStart: billing?.currentPeriodStart || now,
    currentPeriodEnd: billing?.currentPeriodEnd || nextMonth,
  });

  return await db.query.userWorkspaceCreditsTable.findFirst({
    where: {
      AND: [
        {
          userId,
        },
        { organizationId },
      ],
    },
  });
}

/**
 * Create initial free tier billing for a new workspace
 */
export async function createFreeWorkspaceBilling(
  organizationId: string,
  billingOwnerUserId: string,
) {
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);

  await db.insert(schema.workspaceBillingTable).values({
    organizationId,
    plan: "free",
    billingOwnerUserId,
    currentPeriodStart: now,
    currentPeriodEnd: nextMonth,
  });

  // Create initial credits for the billing owner
  await getOrCreateUserWorkspaceCredits(billingOwnerUserId, organizationId);
}

/**
 * Check if monthly reset is needed for a user's credits
 */
export async function checkAndResetUserCredits(userId: string, organizationId: string) {
  const credits = await getOrCreateUserWorkspaceCredits(userId, organizationId);

  if (!credits) {
    throw new Error("Failed to get or create user credits");
  }

  const now = new Date();

  // Check if we need to reset
  if (credits.currentPeriodEnd && now >= credits.currentPeriodEnd) {
    const billing = await getWorkspaceBilling(organizationId);
    const planConfig = PLAN_CONFIG[billing?.plan as PlanType] || PLAN_CONFIG.free;

    // Get workspace period dates for consistency
    const workspaceBilling = await getWorkspaceBilling(organizationId);
    const periodStart = workspaceBilling?.currentPeriodStart || now;
    const periodEnd =
      workspaceBilling?.currentPeriodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 1);

    await db
      .update(schema.userWorkspaceCreditsTable)
      .set({
        creditsUsedThisPeriod: 0,
        creditsAvailable: planConfig.creditsPerMember,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.userWorkspaceCreditsTable.userId, userId),
          eq(schema.userWorkspaceCreditsTable.organizationId, organizationId),
        ),
      );

    return {
      wasReset: true,
      creditsAvailable: planConfig.creditsPerMember,
    };
  }

  return {
    wasReset: false,
    creditsAvailable: credits.creditsAvailable,
  };
}

/**
 * Check credits and consume if available
 * Each user has their own credits in each workspace they're a member of
 */
export async function checkAndConsumeCredits(
  userId: string,
  organizationId: string,
  creditsRequested: number,
  actionType: string,
  resourceId?: string,
): Promise<{
  allowed: boolean;
  remaining: number;
  requiresUpgrade: boolean;
}> {
  // 1. Get or create user's credits for this workspace
  let credits = await getOrCreateUserWorkspaceCredits(userId, organizationId);

  if (!credits) {
    throw new Error("Failed to get user credits");
  }

  // 2. Check if monthly reset is needed
  const resetResult = await checkAndResetUserCredits(userId, organizationId);
  let creditsAvailable = resetResult.creditsAvailable;

  // 3. Get workspace plan for upgrade messaging
  const billing = await getWorkspaceBilling(organizationId);
  const planConfig = PLAN_CONFIG[billing?.plan as PlanType] || PLAN_CONFIG.free;

  // 4. Check hard limit (all tiers have hard limits - no overages)
  if (creditsAvailable < creditsRequested) {
    return {
      allowed: false,
      remaining: creditsAvailable,
      requiresUpgrade: billing?.plan === "free",
    };
  }

  // 5. Deduct credits
  const newAvailable = creditsAvailable - creditsRequested;
  const newUsed = credits.creditsUsedThisPeriod + creditsRequested;

  await db
    .update(schema.userWorkspaceCreditsTable)
    .set({
      creditsAvailable: newAvailable,
      creditsUsedThisPeriod: newUsed,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.userWorkspaceCreditsTable.userId, userId),
        eq(schema.userWorkspaceCreditsTable.organizationId, organizationId),
      ),
    );

  // 6. Log usage for audit trail
  await db.insert(schema.creditUsageLogTable).values({
    organizationId,
    userId,
    creditsConsumed: creditsRequested,
    actionType,
    resourceId: resourceId || null,
  });

  return {
    allowed: true,
    remaining: newAvailable,
    requiresUpgrade: false,
  };
}

/**
 * Reset all members' credits when workspace billing period renews
 * Called via webhook when invoice.finalized
 */
export async function resetAllMemberCredits(organizationId: string) {
  const billing = await getWorkspaceBilling(organizationId);

  if (!billing) {
    throw new Error("Workspace billing not found");
  }

  const planConfig = PLAN_CONFIG[billing.plan as PlanType] || PLAN_CONFIG.free;
  const now = new Date();

  // Calculate next period
  const nextPeriodEnd = new Date(now);
  if (billing.plan === "yearly") {
    nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
  } else {
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
  }
  nextPeriodEnd.setDate(1);
  nextPeriodEnd.setHours(0, 0, 0, 0);

  // Update workspace billing period
  await db
    .update(schema.workspaceBillingTable)
    .set({
      currentPeriodStart: now,
      currentPeriodEnd: nextPeriodEnd,
      updatedAt: now,
    })
    .where(eq(schema.workspaceBillingTable.organizationId, organizationId));

  // Reset all members' credits
  await db
    .update(schema.userWorkspaceCreditsTable)
    .set({
      creditsUsedThisPeriod: 0,
      creditsAvailable: planConfig.creditsPerMember,
      creditsIncludedMonthly: planConfig.creditsPerMember,
      currentPeriodStart: now,
      currentPeriodEnd: nextPeriodEnd,
      updatedAt: now,
    })
    .where(eq(schema.userWorkspaceCreditsTable.organizationId, organizationId));

  console.log("Reset credits for all workspace members", {
    organizationId,
    plan: billing.plan,
    creditsPerMember: planConfig.creditsPerMember,
  });
}

/**
 * Get credit status for a specific user in a workspace
 */
export async function getUserCreditStatus(userId: string, organizationId: string) {
  const credits = await getOrCreateUserWorkspaceCredits(userId, organizationId);

  if (!credits) {
    return null;
  }

  // Check for reset
  const resetResult = await checkAndResetUserCredits(userId, organizationId);

  const billing = await getWorkspaceBilling(organizationId);
  const planConfig = PLAN_CONFIG[billing?.plan as PlanType] || PLAN_CONFIG.free;

  return {
    userId,
    organizationId,
    plan: billing?.plan || "free",
    creditsIncluded: planConfig.creditsPerMember,
    creditsUsed: credits.creditsUsedThisPeriod,
    creditsAvailable: resetResult.creditsAvailable,
    currentPeriodStart: credits.currentPeriodStart,
    currentPeriodEnd: credits.currentPeriodEnd,
  };
}

/**
 * Get all members' credit status for a workspace (admin view)
 */
export async function getWorkspaceMembersCreditStatus(organizationId: string) {
  const billing = await getWorkspaceBilling(organizationId);

  if (!billing) {
    return null;
  }

  const planConfig = PLAN_CONFIG[billing.plan as PlanType] || PLAN_CONFIG.free;

  // Get all members' credits
  const allCredits = await db.query.userWorkspaceCreditsTable.findMany({
    where: { organizationId },
    with: {
      user: true,
    },
  });

  return {
    organizationId,
    plan: billing.plan,
    creditsPerMember: planConfig.creditsPerMember,
    totalCreditsUsed: allCredits.reduce((sum, c) => sum + c.creditsUsedThisPeriod, 0),
    totalCreditsAvailable: allCredits.reduce((sum, c) => sum + c.creditsAvailable, 0),
    members: allCredits.map((c) => ({
      userId: c.userId,
      userName: c.user?.name,
      userEmail: c.user?.email,
      creditsUsed: c.creditsUsedThisPeriod,
      creditsAvailable: c.creditsAvailable,
    })),
    currentPeriodStart: billing.currentPeriodStart,
    currentPeriodEnd: billing.currentPeriodEnd,
    subscriptionStatus: billing.stripeSubscriptionStatus,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
  };
}

/**
 * Create or update credit records when a new member joins
 */
export async function createMemberCredits(userId: string, organizationId: string) {
  return await getOrCreateUserWorkspaceCredits(userId, organizationId);
}

/**
 * Remove credit record when a member leaves (optional cleanup)
 */
export async function removeMemberCredits(userId: string, organizationId: string) {
  await db
    .delete(schema.userWorkspaceCreditsTable)
    .where(
      and(
        eq(schema.userWorkspaceCreditsTable.userId, userId),
        eq(schema.userWorkspaceCreditsTable.organizationId, organizationId),
      ),
    );
}
