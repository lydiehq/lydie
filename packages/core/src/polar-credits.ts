import { db, schema } from "@lydie/database";
import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";
import { Resource } from "sst";

// Initialize Polar client
const polarClient = new Polar({
  accessToken: Resource.PolarApiKey.value,
  server: Resource.App.stage === "production" ? "production" : "sandbox",
});

/**
 * Sync credit balance from Polar's Usage Meter API and cache it locally
 * @param organizationId - The organization ID
 * @returns The current credit balance
 */
export async function syncCreditBalanceFromPolar(organizationId: string): Promise<number> {
  try {
    // Get organization to find the Polar meter ID and subscription ID
    const org = await db
      .select()
      .from(schema.organizationsTable)
      .where(eq(schema.organizationsTable.id, organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const { polarSubscriptionId, polarMeterId } = org[0];

    // If no subscription or meter, return 0
    if (!polarSubscriptionId) {
      console.warn(`No Polar subscription for organization ${organizationId}`);
      return 0;
    }

    // Get the customer ID from the subscription
    const subscription = await polarClient.subscriptions.get({
      id: polarSubscriptionId,
    });

    const customerId = subscription.customerId;

    if (!customerId) {
      console.warn(`No customer ID found for subscription ${polarSubscriptionId}`);
      return 0;
    }

    // Get the meter name from secrets
    const meterName = Resource.PolarMeterName?.value || "ai_credits";

    // List customer meters to find the balance
    const meters = await polarClient.customerMeters.list({
      customerId,
    });

    // Find the ai_credits meter
    const creditMeter = meters.items?.find(
      (meter) => meter.meterSlug === meterName || meter.meterName === meterName,
    );

    if (!creditMeter) {
      console.warn(`No credit meter found for customer ${customerId}`);
      return 0;
    }

    // The balance is the remaining credits
    const balance = creditMeter.balance || 0;

    // Cache the balance locally
    await db
      .update(schema.organizationsTable)
      .set({
        creditBalance: balance,
        creditBalanceUpdatedAt: new Date(),
        polarMeterId: creditMeter.meterId || polarMeterId,
      })
      .where(eq(schema.organizationsTable.id, organizationId));

    return balance;
  } catch (error) {
    console.error("Error syncing credit balance from Polar:", error);
    throw error;
  }
}

/**
 * Deduct credits from Polar's Usage Meter
 * @param organizationId - The organization ID
 * @param credits - The number of credits to deduct
 */
export async function deductCreditsInPolar(organizationId: string, credits: number): Promise<void> {
  try {
    // Get organization to find the Polar subscription ID
    const org = await db
      .select()
      .from(schema.organizationsTable)
      .where(eq(schema.organizationsTable.id, organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const { polarSubscriptionId } = org[0];

    if (!polarSubscriptionId) {
      console.warn(`No Polar subscription for organization ${organizationId}`);
      return;
    }

    // Get the customer ID from the subscription
    const subscription = await polarClient.subscriptions.get({
      id: polarSubscriptionId,
    });

    const customerId = subscription.customerId;

    if (!customerId) {
      console.warn(`No customer ID found for subscription ${polarSubscriptionId}`);
      return;
    }

    // Get the meter name from secrets
    const meterName = Resource.PolarMeterName?.value || "ai_credits";

    // Ingest usage event to deduct credits
    await polarClient.customerMeters.ingest({
      customerId,
      meterSlug: meterName,
      value: credits,
      timestamp: new Date().toISOString(),
    });

    // Sync the new balance
    await syncCreditBalanceFromPolar(organizationId);
  } catch (error) {
    console.error("Error deducting credits in Polar:", error);
    throw error;
  }
}

/**
 * Get the current credit balance (from cache or Polar)
 * @param organizationId - The organization ID
 * @param forceSync - Whether to force a sync from Polar instead of using cache
 * @returns The current credit balance
 */
export async function getCreditBalance(organizationId: string, forceSync = false): Promise<number> {
  try {
    const org = await db
      .select()
      .from(schema.organizationsTable)
      .where(eq(schema.organizationsTable.id, organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    // If forcing sync or cache is stale (older than 5 minutes), sync from Polar
    const cacheAge = org[0].creditBalanceUpdatedAt
      ? Date.now() - org[0].creditBalanceUpdatedAt.getTime()
      : Number.POSITIVE_INFINITY;

    const shouldSync = forceSync || cacheAge > 5 * 60 * 1000; // 5 minutes

    if (shouldSync) {
      return await syncCreditBalanceFromPolar(organizationId);
    }

    return org[0].creditBalance;
  } catch (error) {
    console.error("Error getting credit balance:", error);
    throw error;
  }
}

/**
 * Check if an organization has sufficient credits
 * @param organizationId - The organization ID
 * @param requiredCredits - The number of credits required
 * @returns Object with allowed status and credit info
 */
export async function checkCreditBalance(
  organizationId: string,
  requiredCredits: number,
): Promise<{
  allowed: boolean;
  creditsAvailable: number;
  creditsRequired: number;
}> {
  const creditsAvailable = await getCreditBalance(organizationId, true);

  return {
    allowed: creditsAvailable >= requiredCredits,
    creditsAvailable,
    creditsRequired,
  };
}
