#!/usr/bin/env bun
/**
 * CRON Job: Reset Expired Credits
 * 
 * This script runs daily as a safety net to ensure all users get their credits reset
 * when their billing period ends. The primary reset happens lazily during credit consumption,
 * but this catches inactive users.
 * 
 * Run daily via cron or scheduled job:
 * 0 0 * * * bun run packages/scripts/src/reset-expired-credits.ts
 */

import { db, schema } from "@lydie/database";
import { eq, lt, and, sql } from "drizzle-orm";
import { PLAN_CONFIG, type PlanType } from "@lydie/core/billing/config";

async function resetExpiredCredits() {
  const now = new Date();
  console.log(`[${now.toISOString()}] Starting credit reset job...`);

  // Find all credit records where period has ended (using raw SQL for the date comparison)
  const expiredCredits = await db
    .select()
    .from(schema.userWorkspaceCreditsTable)
    .where(
      and(
        lt(schema.userWorkspaceCreditsTable.currentPeriodEnd, now),
        // Ensure we don't reset records that were just updated (idempotency)
        lt(schema.userWorkspaceCreditsTable.updatedAt, sql`NOW() - INTERVAL '1 hour'`)
      )
    );

  console.log(`Found ${expiredCredits.length} users with expired credit periods`);

  let resetCount = 0;
  let errorCount = 0;

  for (const credit of expiredCredits) {
    try {
      const organizationId = credit.organizationId;
      const userId = credit.userId;
      
      // Get workspace billing to determine plan and period
      const billing = await db.query.workspaceBillingTable.findFirst({
        where: { organizationId },
      });
      
      const plan = (billing?.plan as PlanType) || "free";
      const planConfig = PLAN_CONFIG[plan];

      // Calculate new period - credits reset MONTHLY for all plans
      // Yearly billing = pay once per year, but credits still refill monthly
      const periodStart = now;
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      periodEnd.setHours(0, 0, 0, 0);

      // Reset credits
      await db
        .update(schema.userWorkspaceCreditsTable)
        .set({
          creditsUsedThisPeriod: 0,
          creditsAvailable: planConfig.creditsPerMember,
          creditsIncludedMonthly: planConfig.creditsPerMember,
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

      console.log(`Reset credits for user ${userId} in workspace ${organizationId}:`, {
        plan,
        credits: planConfig.creditsPerMember,
        periodEnd: periodEnd.toISOString(),
      });

      resetCount++;
    } catch (error) {
      console.error(`Failed to reset credits for user ${credit.userId}:`, error);
      errorCount++;
    }
  }

  const summary = {
    totalChecked: expiredCredits.length,
    resetCount,
    errorCount,
    timestamp: now.toISOString(),
  };

  console.log(`[${now.toISOString()}] Credit reset job complete:`, summary);
  return summary;
}

// Run if executed directly
if (import.meta.main) {
  resetExpiredCredits()
    .then((result) => {
      process.exit(result.errorCount > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("Credit reset job failed:", error);
      process.exit(1);
    });
}

export { resetExpiredCredits };
