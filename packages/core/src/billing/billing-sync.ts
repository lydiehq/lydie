import { db, schema } from "@lydie/database";
import { Polar } from "@polar-sh/sdk";
import { eq, and } from "drizzle-orm";
import { Resource } from "sst";

import { syncSeatsFromPolar } from "./seat-management";

/**
 * Polar client instance for billing operations
 */
export const polarClient = new Polar({
  accessToken: Resource.PolarApiKey.value,
  server: Resource.App.stage === "production" ? "production" : "sandbox",
});

/**
 * Determine plan type from product ID
 */
export function getPlanTypeFromProductId(productId: string): "free" | "monthly" | "yearly" {
  const freeId = Resource.PolarProductIdFree.value;
  const monthlyId = Resource.PolarProductIdMonthly.value;
  const yearlyId = Resource.PolarProductIdYearly.value;

  if (productId === freeId) {
    return "free";
  } else if (productId === monthlyId) {
    return "monthly";
  } else if (productId === yearlyId) {
    return "yearly";
  }
  return "free";
}

/**
 * Get count of claimed seats for an organization
 */
export async function getClaimedSeatCount(organizationId: string): Promise<number> {
  const result = await db
    .select()
    .from(schema.seatsTable)
    .where(
      and(
        eq(schema.seatsTable.organizationId, organizationId),
        eq(schema.seatsTable.status, "claimed"),
      ),
    );

  return result.length;
}

/**
 * Sync billing state from customer state webhook payload
 * This is called whenever customer state changes (subscriptions, benefits, meters)
 * A user can have multiple subscriptions (one per workspace), so we process each separately.
 *
 * NOTE: Credits are handled by Polar's Credits benefit system automatically.
 * We do NOT manage credit balances locally - they are stored in Polar.
 */
export async function syncBillingFromCustomerState(payload: any) {
  const customerState = payload.data;
  const subscriptions = customerState.subscriptions || [];

  if (subscriptions.length === 0) {
    console.log("No subscriptions in customer state, skipping sync");
    return;
  }

  // Process each subscription (user can have multiple workspaces)
  for (const subscription of subscriptions) {
    const organizationId = subscription.metadata?.referenceId;
    if (!organizationId || typeof organizationId !== "string") {
      console.warn("No organization ID in subscription metadata, skipping subscription:", subscription.id);
      continue;
    }

    console.log("Syncing billing state for organization:", organizationId, "subscription:", subscription.id);

    // Determine plan type and subscription status
    const isActive = subscription.status === "active" || subscription.status === "trialing";
    const subscriptionStatus = isActive ? subscription.status : "free";
    const subscriptionPlan = isActive ? getPlanTypeFromProductId(subscription.productId) : "free";
    const polarSubscriptionId = isActive ? subscription.id : null;

    // Sync seats if subscription is active
    if (isActive) {
      try {
        await syncSeatsFromPolar(organizationId, {
          subscriptionId: subscription.id,
        });
      } catch (error) {
        console.error("Error syncing seats from customer state:", error);
      }
    }

    // Update organization with subscription state
    await db
      .update(schema.organizationsTable)
      .set({
        subscriptionStatus,
        subscriptionPlan,
        polarSubscriptionId,
      })
      .where(eq(schema.organizationsTable.id, organizationId));

    console.log("Billing state synced:", {
      organizationId,
      subscriptionStatus,
      subscriptionPlan,
      activeSeats: await getClaimedSeatCount(organizationId),
    });
  }
}

/**
 * Get or create a Polar customer for a user
 * Returns the customer's ID (creates one if it doesn't exist)
 */
export async function getOrCreateUserPolarCustomer(
  userId: string,
  email: string,
  name?: string,
): Promise<string | null> {
  // Check if user already has a Polar customer
  const user = await db
    .select({ polarCustomerId: schema.usersTable.polarCustomerId })
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, userId))
    .limit(1);

  if (user[0]?.polarCustomerId) {
    return user[0].polarCustomerId;
  }

  try {
    // Create a new Polar customer for this user
    const customer = await polarClient.customers.create({
      email,
      name: name || email,
      metadata: {
        userId,
        type: "user",
      },
    });

    // Store the customer ID on the user
    await db
      .update(schema.usersTable)
      .set({ polarCustomerId: customer.id })
      .where(eq(schema.usersTable.id, userId));

    console.log("Created Polar customer for user:", userId, customer.id);
    return customer.id;
  } catch (error) {
    console.error("Error creating Polar customer for user:", userId, error);
    return null;
  }
}

/**
 * Setup billing for a newly created organization
 * Creates a subscription for the organization linked to the owner's customer record
 * Fetches user details if not provided
 */
export async function setupOrganizationBilling(
  organizationId: string,
  organizationName: string,
  ownerUserId: string,
) {
  console.log("Setting up billing for organization:", organizationId, organizationName);

  try {
    const [user] = await db
      .select({
        email: schema.usersTable.email,
        name: schema.usersTable.name,
      })
      .from(schema.usersTable)
      .where(eq(schema.usersTable.id, ownerUserId))
      .limit(1);
    if (!user) {
      throw new Error("User not found for organization billing");
    }

    const customerId = await getOrCreateUserPolarCustomer(ownerUserId, user.email, user.name);

    if (!customerId) {
      console.error("Failed to get or create Polar customer for user:", ownerUserId);
      return null;
    }

    // Update organization with billing owner
    await db
      .update(schema.organizationsTable)
      .set({
        billingOwnerUserId: ownerUserId,
      })
      .where(eq(schema.organizationsTable.id, organizationId));

    console.log("Organization billing owner set:", ownerUserId);

    // Assign the free tier subscription for this organization
    try {
      await polarClient.subscriptions.create({
        productId: Resource.PolarProductIdFree.value,
        customerId: customerId,
        metadata: {
          referenceId: organizationId,
          type: "organization_subscription",
        },
      });

      console.log("Free tier subscription assigned for organization:", organizationId);
    } catch (subError) {
      console.error("Error assigning free tier subscription:", subError);
      // Don't throw - we don't want to block organization creation if free tier assignment fails
    }

    return { customerId };
  } catch (error) {
    console.error("Error setting up organization billing:", error);
    // Don't throw - we don't want to block organization creation if billing setup fails
    return null;
  }
}
