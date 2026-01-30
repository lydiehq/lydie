import { db, schema } from "@lydie/database";
import { Polar } from "@polar-sh/sdk";
import { eq, and } from "drizzle-orm";
import { Resource } from "sst";

import { assignSeat, claimSeat, getSeatInfo, syncSeatsFromPolar } from "./seat-management";
import { createId } from "../id";

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
 * We do NOT sync credit balances from webhooks - they are queried on-demand.
 */
export async function syncBillingFromCustomerState(payload: any) {
  const customerState = payload.data;
  // Polar sends activeSubscriptions array in customer.state_changed webhook
  const subscriptions = customerState.activeSubscriptions || customerState.subscriptions || [];

  if (subscriptions.length === 0) {
    console.log("No subscriptions in customer state, skipping sync");
    return;
  }

  console.log(`Processing ${subscriptions.length} subscription(s) from webhook`);

  // Process each subscription (user can have multiple workspaces)
  for (const subscription of subscriptions) {
    const organizationId = subscription.metadata?.referenceId;
    if (!organizationId || typeof organizationId !== "string") {
      console.warn(
        "No organization ID in subscription metadata, skipping subscription:",
        subscription.id,
      );
      continue;
    }

    console.log(
      "Syncing billing state for organization:",
      organizationId,
      "subscription:",
      subscription.id,
    );

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
 * Handle benefit_grant.created webhook
 * Triggered when a seat is claimed and benefits are granted
 * This is where we sync credit balances
 */
export async function handleBenefitGrantCreated(payload: any) {
  const data = payload.data;
  const benefit = data.benefit;
  const customer = data.customer;

  console.log("Benefit grant created:", {
    benefitId: benefit.id,
    benefitType: benefit.type,
    customerId: customer.id,
    subscriptionId: data.subscriptionId,
    orderId: data.orderId,
  });

  // Only process Credits benefits
  if (benefit.type !== "meter_credit") {
    console.log("Skipping non-credits benefit:", benefit.type);
    return;
  }

  try {
    // Find the user's seat for this subscription/order
    // The seat should have been claimed by the user who received this benefit
    const seats = await db
      .select({
        id: schema.seatsTable.id,
        organizationId: schema.seatsTable.organizationId,
        claimedByUserId: schema.seatsTable.claimedByUserId,
      })
      .from(schema.seatsTable)
      .where(
        and(
          eq(schema.seatsTable.polarSubscriptionId, data.subscriptionId),
          eq(schema.seatsTable.status, "claimed"),
        ),
      );

    if (seats.length === 0) {
      console.warn("No claimed seat found for subscription:", data.subscriptionId);
      return;
    }

    // Extract credit amount from benefit properties
    const creditAmount = benefit.properties?.amount || 0;

    // Update credit balance for all seats in this subscription
    for (const seat of seats) {
      await db
        .update(schema.seatsTable)
        .set({
          creditBalance: creditAmount,
        })
        .where(eq(schema.seatsTable.id, seat.id));

      console.log("Credits synced to seat:", {
        seatId: seat.id,
        organizationId: seat.organizationId,
        credits: creditAmount,
      });
    }
  } catch (error) {
    console.error("Error syncing credits from benefit grant:", error);
  }
}

/**
 * Handle benefit_grant.revoked webhook
 * Triggered when a seat is revoked and benefits are removed
 */
export async function handleBenefitGrantRevoked(payload: any) {
  const data = payload.data;
  const benefit = data.benefit;

  console.log("Benefit grant revoked:", {
    benefitId: benefit.id,
    benefitType: benefit.type,
    subscriptionId: data.subscriptionId,
  });

  // Only process Credits benefits
  if (benefit.type !== "credits") {
    return;
  }

  try {
    // Reset credit balance for seats in this subscription
    await db
      .update(schema.seatsTable)
      .set({
        creditBalance: 0,
      })
      .where(
        and(
          eq(schema.seatsTable.polarSubscriptionId, data.subscriptionId),
          eq(schema.seatsTable.status, "claimed"),
        ),
      );

    console.log("Credits reset for revoked benefits on subscription:", data.subscriptionId);
  } catch (error) {
    console.error("Error resetting credits from benefit revoke:", error);
  }
}

/**
 * Sync members from claimed seats
 * Called after syncing seats from Polar to ensure all claimed seat holders are organization members
 * This creates the link between billing (seats) and access control (members)
 */
export async function syncMembersFromSeats(organizationId: string, subscriptionId?: string) {
  console.log("Syncing members from seats for org:", organizationId);

  try {
    // Get all claimed seats for this organization
    const seats = await db
      .select()
      .from(schema.seatsTable)
      .where(
        and(
          eq(schema.seatsTable.organizationId, organizationId),
          eq(schema.seatsTable.status, "claimed"),
        ),
      );

    for (const seat of seats) {
      // Skip seats without a claimed user
      if (!seat.claimedByUserId) continue;

      // Check if the user is already a member
      const existingMember = await db
        .select()
        .from(schema.membersTable)
        .where(
          and(
            eq(schema.membersTable.organizationId, organizationId),
            eq(schema.membersTable.userId, seat.claimedByUserId),
          ),
        )
        .limit(1);

      if (existingMember.length === 0) {
        // User has a claimed seat but is not a member - add them
        const role = (seat.seatMetadata?.role as string) || "member";

        await db.insert(schema.membersTable).values({
          id: createId(),
          organizationId,
          userId: seat.claimedByUserId,
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log(`Added member ${seat.claimedByUserId} to org ${organizationId} from claimed seat`);
      }
    }

    console.log(`Synced ${seats.length} claimed seats to members for org ${organizationId}`);
  } catch (error) {
    console.error("Error syncing members from seats:", error);
    throw error;
  }
}

/**
 * Handle when a seat is claimed in Polar
 * This is called from the seat claim flow or webhooks
 * It ensures the user becomes a member of the organization
 */
export async function handleSeatClaimed(
  organizationId: string,
  seatEmail: string,
  claimingUserId?: string,
) {
  console.log("Handling seat claimed:", { organizationId, seatEmail, claimingUserId });

  try {
    // Find the seat by email
    const seat = await db
      .select()
      .from(schema.seatsTable)
      .where(
        and(
          eq(schema.seatsTable.organizationId, organizationId),
          eq(schema.seatsTable.assignedEmail, seatEmail),
          eq(schema.seatsTable.status, "claimed"),
        ),
      )
      .limit(1);

    const seatRecord = seat[0];
    if (!seatRecord) {
      console.warn("No claimed seat found for email:", seatEmail);
      return { success: false, error: "No claimed seat found" };
    }

    const userId = claimingUserId || seatRecord.claimedByUserId;

    if (!userId) {
      // Store pending member for when user signs up
      await db.insert(schema.pendingSeatMembersTable).values({
        id: createId(),
        organizationId,
        seatId: seatRecord.id,
        email: seatEmail,
        role: (seatRecord.seatMetadata?.role as string) || "member",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`Stored pending member for ${seatEmail} in org ${organizationId}`);
      return { success: true, pending: true };
    }

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(schema.membersTable)
      .where(
        and(
          eq(schema.membersTable.organizationId, organizationId),
          eq(schema.membersTable.userId, userId),
        ),
      )
      .limit(1);

    if (existingMember.length > 0) {
      console.log(`User ${userId} is already a member of org ${organizationId}`);
      return { success: true, alreadyMember: true };
    }

    // Add as member
    const role = (seatRecord.seatMetadata?.role as string) || "member";

    await db.insert(schema.membersTable).values({
      id: createId(),
      organizationId,
      userId,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update seat with claimedByUserId if not set
    if (!seatRecord.claimedByUserId) {
      await db
        .update(schema.seatsTable)
        .set({
          claimedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.seatsTable.id, seatRecord.id));
    }

    console.log(`Added user ${userId} as ${role} to org ${organizationId} from claimed seat`);
    return { success: true };
  } catch (error) {
    console.error("Error handling seat claimed:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Process pending seat members when a user signs up
 * Called from the user creation hook
 */
export async function processPendingSeatMembers(userId: string, userEmail: string) {
  console.log("Processing pending seat members for:", userEmail);

  try {
    // Find all pending seat members for this email
    const pendingMembers = await db
      .select()
      .from(schema.pendingSeatMembersTable)
      .where(eq(schema.pendingSeatMembersTable.email, userEmail));

    for (const pending of pendingMembers) {
      // Add user as member
      await db.insert(schema.membersTable).values({
        id: createId(),
        organizationId: pending.organizationId,
        userId,
        role: pending.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update the seat to link to this user
      await db
        .update(schema.seatsTable)
        .set({
          claimedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.seatsTable.id, pending.seatId));

      // Remove pending record
      await db
        .delete(schema.pendingSeatMembersTable)
        .where(eq(schema.pendingSeatMembersTable.id, pending.id));

      console.log(`Processed pending member for ${userEmail} in org ${pending.organizationId}`);
    }

    return { success: true, processed: pendingMembers.length };
  } catch (error) {
    console.error("Error processing pending seat members:", error);
    return { success: false, error: String(error) };
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
  ownerEmail?: string,
  ownerName?: string,
) {
  console.log("Setting up billing for organization:", organizationId, organizationName);

  try {
    // If email not provided, fetch user details from database
    let email = ownerEmail;
    let name = ownerName;

    if (!email) {
      const user = await db
        .select({
          email: schema.usersTable.email,
          name: schema.usersTable.name,
        })
        .from(schema.usersTable)
        .where(eq(schema.usersTable.id, ownerUserId))
        .limit(1);

      if (user[0]) {
        email = user[0].email;
        name = name || user[0].name || undefined;
      }
    }

    if (!email) {
      console.error("Could not find email for user:", ownerUserId);
      return null;
    }

    // Get or create the Polar customer for the owner
    const customerId = await getOrCreateUserPolarCustomer(ownerUserId, email, name);
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
    let subscriptionId: string | null = null;
    try {
      const subscription = await polarClient.subscriptions.create({
        productId: Resource.PolarProductIdFree.value,
        customerId: customerId,
        metadata: {
          referenceId: organizationId,
          type: "organization_subscription",
        },
      });
      subscriptionId = subscription.id;

      console.log("Free tier subscription created:", subscription.id, "for organization:", organizationId);
    } catch (subError) {
      console.error("Error assigning free tier subscription:", subError);
      // Don't throw - we don't want to block organization creation if free tier assignment fails
    }

    // Assign a seat to the owner so they get benefits (credits, etc.)
    // According to Polar docs, billing managers don't automatically get seats - must be assigned
    if (subscriptionId) {
      try {
        const seatResult = await assignSeat(
          organizationId,
          { subscriptionId },
          email,
          { role: "owner", isOwner: true }
        );
        if (seatResult.success && seatResult.seat?.invitationToken) {
          console.log("Seat assigned to owner:", ownerUserId, "for organization:", organizationId);
          
          // Auto-claim the owner's seat immediately so they get benefits (credits)
          // This avoids requiring the owner to click a claim link for their own workspace
          const claimResult = await claimSeat(seatResult.seat.invitationToken, ownerUserId);
          if (claimResult.success) {
            console.log("Owner's seat auto-claimed:", ownerUserId);
          } else {
            console.error("Failed to auto-claim owner seat:", claimResult.error);
          }
        } else {
          console.error("Failed to assign seat to owner:", seatResult.error);
        }
      } catch (seatError) {
        console.error("Error assigning seat to owner:", seatError);
        // Don't throw - organization creation shouldn't fail if seat assignment fails
      }
    }

    return { customerId, subscriptionId };
  } catch (error) {
    console.error("Error setting up organization billing:", error);
    // Don't throw - we don't want to block organization creation if billing setup fails
    return null;
  }
}
