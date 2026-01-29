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
 * Count active members in an organization (excludes guests in the future)
 * @param organizationId - The organization ID
 * @returns The number of active members
 */
export async function countActiveMembers(organizationId: string): Promise<number> {
  const members = await db
    .select()
    .from(schema.membersTable)
    .where(eq(schema.membersTable.organizationId, organizationId));

  // For now, all members count as seats
  // In the future, you could filter out guests based on role
  return members.length;
}

/**
 * Update the seat count in the database and sync with Polar subscription
 * @param organizationId - The organization ID
 */
export async function syncSeatCount(organizationId: string): Promise<void> {
  try {
    // Get organization
    const org = await db
      .select()
      .from(schema.organizationsTable)
      .where(eq(schema.organizationsTable.id, organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const { polarSubscriptionId, subscriptionPlan } = org[0];

    // Only sync for paid plans
    if (subscriptionPlan === "free" || !polarSubscriptionId) {
      console.log(`Skipping seat sync for ${organizationId}: free plan or no subscription`);
      return;
    }

    // Count active members
    const memberCount = await countActiveMembers(organizationId);

    // Update local seat count
    await db
      .update(schema.organizationsTable)
      .set({
        paidSeats: memberCount,
      })
      .where(eq(schema.organizationsTable.id, organizationId));

    // Update subscription quantity in Polar
    try {
      await polarClient.subscriptions.update({
        id: polarSubscriptionId,
        subscriptionUpdate: {
          productPriceId: undefined, // Keep existing price
          quantity: memberCount,
        },
      });

      console.log(`Updated Polar subscription ${polarSubscriptionId} quantity to ${memberCount}`);
    } catch (polarError) {
      console.error("Error updating Polar subscription quantity:", polarError);
      // Continue even if Polar update fails - local count is updated
    }
  } catch (error) {
    console.error("Error syncing seat count:", error);
    throw error;
  }
}

/**
 * Handle member addition - update seat count
 * @param organizationId - The organization ID
 */
export async function onMemberAdded(organizationId: string): Promise<void> {
  console.log(`Member added to organization ${organizationId}, syncing seats...`);
  await syncSeatCount(organizationId);
}

/**
 * Handle member removal - update seat count
 * @param organizationId - The organization ID
 */
export async function onMemberRemoved(organizationId: string): Promise<void> {
  console.log(`Member removed from organization ${organizationId}, syncing seats...`);
  await syncSeatCount(organizationId);
}
