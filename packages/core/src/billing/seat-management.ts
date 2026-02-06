import { db, schema } from "@lydie/database";
import { eq, sql } from "drizzle-orm";

import { stripe } from "./config";
import { getWorkspaceBilling } from "./workspace-credits";

/**
 * Get the count of active members in an organization
 */
export async function getMemberCount(organizationId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.membersTable)
    .where(eq(schema.membersTable.organizationId, organizationId));

  return result[0]?.count || 1;
}

/**
 * Update the subscription quantity to match the current member count
 * Called when members are added or removed
 */
export async function syncSubscriptionQuantity(
  organizationId: string,
  options: { prorationBehavior?: "create_prorations" | "none" } = {},
) {
  const billing = await getWorkspaceBilling(organizationId);

  // Only update if there's an active subscription
  if (!billing?.stripeSubscriptionId) {
    console.log("No active subscription found, skipping quantity sync", {
      organizationId,
    });
    return { success: false, reason: "no_subscription" };
  }

  if (
    billing.stripeSubscriptionStatus !== "active" &&
    billing.stripeSubscriptionStatus !== "trialing"
  ) {
    console.log("Subscription not active, skipping quantity sync", {
      organizationId,
      status: billing.stripeSubscriptionStatus,
    });
    return { success: false, reason: "subscription_inactive" };
  }

  const memberCount = await getMemberCount(organizationId);

  try {
    // Get the subscription to find the subscription item ID
    const subscription = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId);

    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) {
      throw new Error("No subscription items found");
    }

    // Update the quantity
    const prorationBehavior = options.prorationBehavior || "create_prorations";

    await stripe.subscriptionItems.update(subscriptionItem.id, {
      quantity: memberCount,
      proration_behavior: prorationBehavior,
    });

    console.log("Updated subscription quantity", {
      organizationId,
      subscriptionId: billing.stripeSubscriptionId,
      quantity: memberCount,
      prorationBehavior,
    });

    return {
      success: true,
      quantity: memberCount,
      subscriptionId: billing.stripeSubscriptionId,
    };
  } catch (error) {
    console.error("Failed to update subscription quantity", {
      organizationId,
      error,
    });
    throw error;
  }
}

/**
 * Get member count with subscription details for display
 */
export async function getBillingMemberCount(organizationId: string) {
  const billing = await getWorkspaceBilling(organizationId);
  const memberCount = await getMemberCount(organizationId);

  let stripeQuantity = 1;

  if (billing?.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId);
      const subscriptionItem = subscription.items.data[0];
      stripeQuantity = subscriptionItem?.quantity || 1;
    } catch {
      // Ignore errors
    }
  }

  return {
    memberCount,
    stripeQuantity,
    plan: billing?.plan || "free",
    status: billing?.stripeSubscriptionStatus,
  };
}
