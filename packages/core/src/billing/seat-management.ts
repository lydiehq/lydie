import { db, schema } from "@lydie/database";
import { Polar } from "@polar-sh/sdk";
import { eq, and, count } from "drizzle-orm";
import { Resource } from "sst";
import { createId } from "../id";

const polarClient = new Polar({
  accessToken: Resource.PolarApiKey.value,
  server: Resource.App.stage === "production" ? "production" : "sandbox",
});



/**
 * Seat status types from Polar
 */
export type SeatStatus = "pending" | "claimed" | "revoked";

/**
 * Seat information returned from our database
 */
export interface SeatInfo {
  seats: Array<{
    id: string;
    polarSeatId: string;
    status: SeatStatus;
    assignedEmail: string;
    claimedByUserId: string | null;
    seatMetadata: Record<string, any> | null;
    assignedAt: Date;
    claimedAt: Date | null;
    revokedAt: Date | null;
  }>;
  availableSeats: number;
  totalSeats: number;
  canAssign: boolean;
}

/**
 * Get seat information for an organization's subscription or order
 * This works for both subscriptions and one-time purchases
 */
export async function getSeatInfo(
  organizationId: string,
  params: { subscriptionId?: string; orderId?: string }
): Promise<SeatInfo> {
  // Validate that we have either subscriptionId or orderId
  if (!params.subscriptionId && !params.orderId) {
    throw new Error("Either subscriptionId or orderId must be provided");
  }

  // Get seats from our database (synced from Polar)
  const seats = await db
    .select({
      id: schema.seatsTable.id,
      polarSeatId: schema.seatsTable.polarSeatId,
      status: schema.seatsTable.status,
      assignedEmail: schema.seatsTable.assignedEmail,
      claimedByUserId: schema.seatsTable.claimedByUserId,
      seatMetadata: schema.seatsTable.seatMetadata,
      assignedAt: schema.seatsTable.assignedAt,
      claimedAt: schema.seatsTable.claimedAt,
      revokedAt: schema.seatsTable.revokedAt,
    })
    .from(schema.seatsTable)
    .where(
      and(
        eq(schema.seatsTable.organizationId, organizationId),
        params.subscriptionId
          ? eq(schema.seatsTable.polarSubscriptionId, params.subscriptionId)
          : eq(schema.seatsTable.polarOrderId, params.orderId!)
      )
    );

  // Count available (pending) seats
  const availableSeats = seats.filter((s) => s.status === "pending").length;
  const totalSeats = seats.length;

  // Cast status to proper type
  const typedSeats: SeatInfo["seats"] = seats.map((s) => ({
    ...s,
    status: s.status as SeatStatus,
  }));

  return {
    seats: typedSeats,
    availableSeats,
    totalSeats,
    canAssign: availableSeats > 0,
  };
}

/**
 * Get all seats across all subscriptions/orders for an organization
 */
export async function getAllOrganizationSeats(organizationId: string): Promise<SeatInfo> {
  const seats = await db
    .select({
      id: schema.seatsTable.id,
      polarSeatId: schema.seatsTable.polarSeatId,
      status: schema.seatsTable.status,
      assignedEmail: schema.seatsTable.assignedEmail,
      claimedByUserId: schema.seatsTable.claimedByUserId,
      seatMetadata: schema.seatsTable.seatMetadata,
      assignedAt: schema.seatsTable.assignedAt,
      claimedAt: schema.seatsTable.claimedAt,
      revokedAt: schema.seatsTable.revokedAt,
    })
    .from(schema.seatsTable)
    .where(eq(schema.seatsTable.organizationId, organizationId));

  const availableSeats = seats.filter((s) => s.status === "pending").length;
  const totalSeats = seats.length;

  // Cast status to proper type
  const typedSeats: SeatInfo["seats"] = seats.map((s) => ({
    ...s,
    status: s.status as SeatStatus,
  }));

  return {
    seats: typedSeats,
    availableSeats,
    totalSeats,
    canAssign: availableSeats > 0,
  };
}

/**
 * Interface for Polar Customer Seats API
 * NOTE: These methods require the seat_based_pricing_enabled feature flag
 * and the latest beta version of @polar-sh/sdk
 */
interface PolarCustomerSeats {
  assign(params: {
    subscriptionId?: string;
    orderId?: string;
    email: string;
    metadata?: Record<string, any>;
  }): Promise<{
    id: string;
    invitationToken?: string;
    expiresAt?: string;
    status: SeatStatus;
    customerEmail: string;
    metadata?: Record<string, any>;
  }>;

  revoke(params: { seatId: string }): Promise<void>;

  resend(params: { seatId: string }): Promise<{
    id: string;
    invitationToken?: string;
    expiresAt?: string;
  }>;

  getClaimInfo(params: { invitationToken: string }): Promise<{
    canClaim: boolean;
    productName?: string;
    organizationName?: string;
    customerEmail?: string;
  }>;

  claim(params: { invitationToken: string }): Promise<{
    seat: {
      id: string;
      status: SeatStatus;
      customerEmail: string;
    };
    customerSessionToken: string;
  }>;

  list(params: {
    subscriptionId?: string;
    orderId?: string;
  }): Promise<{
    items: Array<{
      id: string;
      status: SeatStatus;
      customerEmail: string;
      invitationToken?: string;
      metadata?: Record<string, any>;
      assignedAt?: string;
      claimedAt?: string;
      revokedAt?: string;
      expiresAt?: string;
    }>;
  }>;
}

/**
 * Access the customer seats API
 * NOTE: This assumes the beta SDK with seat-based pricing support
 */
function getCustomerSeatsApi(): PolarCustomerSeats {
  // @ts-expect-error - customerSeats is only available in the beta SDK with seat_based_pricing_enabled
  const api = polarClient.customerSeats as PolarCustomerSeats | undefined;

  if (!api) {
    throw new Error(
      "Polar Customer Seats API not available. Ensure you have the beta SDK with seat_based_pricing_enabled feature flag."
    );
  }

  return api;
}

/**
 * Assign a seat to an email address
 * This creates a pending seat in Polar and stores it locally
 */
export async function assignSeat(
  organizationId: string,
  params: { subscriptionId?: string; orderId?: string },
  email: string,
  metadata?: Record<string, any>
): Promise<{
  success: boolean;
  seat?: typeof schema.seatsTable.$inferSelect;
  error?: string;
}> {
  try {
    // Validate that we have either subscriptionId or orderId
    if (!params.subscriptionId && !params.orderId) {
      throw new Error("Either subscriptionId or orderId must be provided");
    }

    // Check if this email already has a pending or claimed seat
    const existingSeat = await db
      .select()
      .from(schema.seatsTable)
      .where(
        and(
          eq(schema.seatsTable.organizationId, organizationId),
          eq(schema.seatsTable.assignedEmail, email),
          eq(schema.seatsTable.status, "pending")
        )
      )
      .limit(1);

    if (existingSeat.length > 0) {
      return {
        success: false,
        error: "This email already has a pending seat invitation",
      };
    }

    // Assign seat in Polar
    const customerSeats = getCustomerSeatsApi();
    const polarSeat = await customerSeats.assign({
      ...(params.subscriptionId
        ? { subscriptionId: params.subscriptionId }
        : { orderId: params.orderId! }),
      email: email,
      metadata: metadata,
    });

    // Store seat in our database
    const seatId = createId();
    const now = new Date();
    const newSeat = {
      id: seatId,
      organizationId: organizationId,
      polarSeatId: polarSeat.id,
      polarSubscriptionId: params.subscriptionId || null,
      polarOrderId: params.orderId || null,
      status: "pending" as const,
      assignedEmail: email,
      claimedByUserId: null,
      invitationToken: polarSeat.invitationToken || null,
      seatMetadata: metadata || null,
      assignedAt: now,
      claimedAt: null,
      revokedAt: null,
      expiresAt: polarSeat.expiresAt ? new Date(polarSeat.expiresAt) : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.seatsTable).values(newSeat);

    return {
      success: true,
      seat: newSeat,
    };
  } catch (error: any) {
    console.error("Error assigning seat:", error);

    // Handle specific Polar errors
    if (error.status === 400) {
      return {
        success: false,
        error: "No seats available or invalid request",
      };
    }

    if (error.status === 404) {
      return {
        success: false,
        error: "Subscription or order not found",
      };
    }

    return {
      success: false,
      error: error.message || "Failed to assign seat",
    };
  }
}

/**
 * Revoke a seat
 * This removes access but does not issue a refund
 */
export async function revokeSeat(
  seatId: string
): Promise<{
  success: boolean;
  seat?: typeof schema.seatsTable.$inferSelect;
  error?: string;
}> {
  try {
    // Get the seat from our database
    const seat = await db
      .select()
      .from(schema.seatsTable)
      .where(eq(schema.seatsTable.id, seatId))
      .limit(1);

    if (!seat[0]) {
      return {
        success: false,
        error: "Seat not found",
      };
    }

    // Revoke in Polar
    const customerSeats = getCustomerSeatsApi();
    await customerSeats.revoke({
      seatId: seat[0].polarSeatId,
    });

    // Update our database
    const revokedAt = new Date();
    await db
      .update(schema.seatsTable)
      .set({
        status: "revoked",
        revokedAt: revokedAt,
        updatedAt: revokedAt,
      })
      .where(eq(schema.seatsTable.id, seatId));

    return {
      success: true,
      seat: {
        ...seat[0],
        status: "revoked" as const,
        revokedAt,
      },
    };
  } catch (error: any) {
    console.error("Error revoking seat:", error);
    return {
      success: false,
      error: error.message || "Failed to revoke seat",
    };
  }
}

/**
 * Resend a seat invitation
 * Useful when the invitation token has expired
 */
export async function resendSeatInvitation(
  seatId: string
): Promise<{
  success: boolean;
  seat?: typeof schema.seatsTable.$inferSelect;
  error?: string;
}> {
  try {
    // Get the seat from our database
    const seat = await db
      .select()
      .from(schema.seatsTable)
      .where(eq(schema.seatsTable.id, seatId))
      .limit(1);

    if (!seat[0]) {
      return {
        success: false,
        error: "Seat not found",
      };
    }

    if (seat[0].status !== "pending") {
      return {
        success: false,
        error: "Can only resend invitations for pending seats",
      };
    }

    // Resend in Polar
    const customerSeats = getCustomerSeatsApi();
    const updatedPolarSeat = await customerSeats.resend({
      seatId: seat[0].polarSeatId,
    });

    // Update our database with new token and expiration
    const updatedAt = new Date();
    await db
      .update(schema.seatsTable)
      .set({
        invitationToken: updatedPolarSeat.invitationToken || null,
        expiresAt: updatedPolarSeat.expiresAt ? new Date(updatedPolarSeat.expiresAt) : null,
        updatedAt: updatedAt,
      })
      .where(eq(schema.seatsTable.id, seatId));

    return {
      success: true,
      seat: {
        ...seat[0],
        invitationToken: updatedPolarSeat.invitationToken || null,
        expiresAt: updatedPolarSeat.expiresAt ? new Date(updatedPolarSeat.expiresAt) : null,
        updatedAt,
      },
    };
  } catch (error: any) {
    console.error("Error resending seat invitation:", error);
    return {
      success: false,
      error: error.message || "Failed to resend invitation",
    };
  }
}

/**
 * Get claim information for a seat invitation token
 * This is called on the claim page (no auth required)
 */
export async function getSeatClaimInfo(invitationToken: string): Promise<{
  canClaim: boolean;
  productName?: string;
  organizationName?: string;
  email?: string;
  error?: string;
}> {
  try {
    const customerSeats = getCustomerSeatsApi();
    const claimInfo = await customerSeats.getClaimInfo({
      invitationToken: invitationToken,
    });

    return {
      canClaim: claimInfo.canClaim,
      productName: claimInfo.productName,
      organizationName: claimInfo.organizationName,
      email: claimInfo.customerEmail,
    };
  } catch (error: any) {
    console.error("Error getting seat claim info:", error);

    if (error.status === 400) {
      return {
        canClaim: false,
        error: "This invitation has expired or already been claimed",
      };
    }

    return {
      canClaim: false,
      error: error.message || "Invalid invitation",
    };
  }
}

/**
 * Claim a seat using an invitation token
 * Called when a user clicks the claim link
 */
export async function claimSeat(
  invitationToken: string,
  claimingUserId: string
): Promise<{
  success: boolean;
  seat?: typeof schema.seatsTable.$inferSelect;
  customerSessionToken?: string;
  error?: string;
}> {
  try {
    // Claim in Polar
    const customerSeats = getCustomerSeatsApi();
    const claimResult = await customerSeats.claim({
      invitationToken: invitationToken,
    });

    // Find the seat in our database by invitation token
    const seat = await db
      .select()
      .from(schema.seatsTable)
      .where(eq(schema.seatsTable.invitationToken, invitationToken))
      .limit(1);

    if (seat[0]) {
      // Update our database with claimed status
      const claimedAt = new Date();
      await db
        .update(schema.seatsTable)
        .set({
          status: "claimed",
          claimedByUserId: claimingUserId,
          claimedAt: claimedAt,
          updatedAt: claimedAt,
        })
        .where(eq(schema.seatsTable.id, seat[0].id));

      return {
        success: true,
        seat: {
          ...seat[0],
          status: "claimed" as const,
          claimedByUserId: claimingUserId,
          claimedAt,
        },
        customerSessionToken: claimResult.customerSessionToken,
      };
    }

    // If seat not found locally, return success with just the session token
    return {
      success: true,
      customerSessionToken: claimResult.customerSessionToken,
    };
  } catch (error: any) {
    console.error("Error claiming seat:", error);

    if (error.status === 400) {
      return {
        success: false,
        error: "This invitation has expired or already been claimed",
      };
    }

    return {
      success: false,
      error: error.message || "Failed to claim seat",
    };
  }
}

/**
 * Sync seats from Polar to local database
 * Called by webhooks when seat status changes in Polar
 */
export async function syncSeatsFromPolar(
  organizationId: string,
  params: { subscriptionId?: string; orderId?: string }
): Promise<void> {
  try {
    if (!params.subscriptionId && !params.orderId) {
      throw new Error("Either subscriptionId or orderId must be provided");
    }

    // Get seats from Polar
    const customerSeats = getCustomerSeatsApi();
    const polarSeats = await customerSeats.list({
      ...(params.subscriptionId
        ? { subscriptionId: params.subscriptionId }
        : { orderId: params.orderId! }),
    });

    // Get existing seats from our database
    const existingSeats = await db
      .select()
      .from(schema.seatsTable)
      .where(
        and(
          eq(schema.seatsTable.organizationId, organizationId),
          params.subscriptionId
            ? eq(schema.seatsTable.polarSubscriptionId, params.subscriptionId)
            : eq(schema.seatsTable.polarOrderId, params.orderId!)
        )
      );

    // Create a map of existing seats by polarSeatId
    const existingSeatsMap = new Map(existingSeats.map((s) => [s.polarSeatId, s]));

    // Process each seat from Polar
    for (const polarSeat of polarSeats.items || []) {
      const existingSeat = existingSeatsMap.get(polarSeat.id);

      if (existingSeat) {
        // Update existing seat if status changed
        if (existingSeat.status !== polarSeat.status) {
          await db
            .update(schema.seatsTable)
            .set({
              status: polarSeat.status as SeatStatus,
              claimedAt: polarSeat.claimedAt ? new Date(polarSeat.claimedAt) : existingSeat.claimedAt,
              revokedAt: polarSeat.revokedAt ? new Date(polarSeat.revokedAt) : existingSeat.revokedAt,
              updatedAt: new Date(),
            })
            .where(eq(schema.seatsTable.id, existingSeat.id));
        }
      } else {
        // Create new seat record
        const now = new Date();
        await db.insert(schema.seatsTable).values({
          id: createId(),
          organizationId: organizationId,
          polarSeatId: polarSeat.id,
          polarSubscriptionId: params.subscriptionId || null,
          polarOrderId: params.orderId || null,
          status: polarSeat.status as SeatStatus,
          assignedEmail: polarSeat.customerEmail,
          claimedByUserId: null, // Will be updated when user claims via our UI
          invitationToken: polarSeat.invitationToken || null,
          seatMetadata: polarSeat.metadata || null,
          assignedAt: polarSeat.assignedAt ? new Date(polarSeat.assignedAt) : now,
          claimedAt: polarSeat.claimedAt ? new Date(polarSeat.claimedAt) : null,
          revokedAt: polarSeat.revokedAt ? new Date(polarSeat.revokedAt) : null,
          expiresAt: polarSeat.expiresAt ? new Date(polarSeat.expiresAt) : null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  } catch (error) {
    console.error("Error syncing seats from Polar:", error);
    throw error;
  }
}

/**
 * Get seat statistics for an organization
 * Useful for monitoring utilization and upsell opportunities
 */
export async function getSeatStats(organizationId: string): Promise<{
  totalSeats: number;
  pendingSeats: number;
  claimedSeats: number;
  revokedSeats: number;
  utilizationPercentage: number;
}> {
  const result = await db
    .select({
      status: schema.seatsTable.status,
      count: count(),
    })
    .from(schema.seatsTable)
    .where(eq(schema.seatsTable.organizationId, organizationId))
    .groupBy(schema.seatsTable.status);

  const stats = {
    totalSeats: 0,
    pendingSeats: 0,
    claimedSeats: 0,
    revokedSeats: 0,
    utilizationPercentage: 0,
  };

  for (const row of result) {
    stats.totalSeats += row.count;
    if (row.status === "pending") stats.pendingSeats += row.count;
    if (row.status === "claimed") stats.claimedSeats += row.count;
    if (row.status === "revoked") stats.revokedSeats += row.count;
  }

  // Calculate utilization (claimed / total active seats)
  const activeSeats = stats.totalSeats - stats.revokedSeats;
  if (activeSeats > 0) {
    stats.utilizationPercentage = (stats.claimedSeats / activeSeats) * 100;
  }

  return stats;
}

/**
 * Bulk assign seats to multiple emails
 */
export async function assignMultipleSeats(
  organizationId: string,
  params: { subscriptionId?: string; orderId?: string },
  emails: string[],
  metadata?: Record<string, any>
): Promise<{
  succeeded: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
  seats: Array<typeof schema.seatsTable.$inferSelect>;
}> {
  const results = await Promise.allSettled(
    emails.map((email) =>
      assignSeat(organizationId, params, email, metadata)
    )
  );

  const succeeded: Array<typeof schema.seatsTable.$inferSelect> = [];
  const errors: Array<{ email: string; error: string }> = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.success && result.value.seat) {
      succeeded.push(result.value.seat);
    } else {
      errors.push({
        email: emails[index]!,
        error:
          result.status === "rejected"
            ? result.reason?.message || "Unknown error"
            : result.value.error || "Failed to assign seat",
      });
    }
  });

  return {
    succeeded: succeeded.length,
    failed: errors.length,
    errors,
    seats: succeeded,
  };
}

/**
 * Check if a user has a claimed seat in an organization
 * Used to verify access to benefits
 */
export async function hasClaimedSeat(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const seat = await db
    .select()
    .from(schema.seatsTable)
    .where(
      and(
        eq(schema.seatsTable.organizationId, organizationId),
        eq(schema.seatsTable.claimedByUserId, userId),
        eq(schema.seatsTable.status, "claimed")
      )
    )
    .limit(1);

  return seat.length > 0;
}

/**
 * Get the seat for a user in an organization (if they have one)
 */
export async function getUserSeat(
  organizationId: string,
  userId: string
): Promise<typeof schema.seatsTable.$inferSelect | null> {
  const seat = await db
    .select()
    .from(schema.seatsTable)
    .where(
      and(
        eq(schema.seatsTable.organizationId, organizationId),
        eq(schema.seatsTable.claimedByUserId, userId),
        eq(schema.seatsTable.status, "claimed")
      )
    )
    .limit(1);

  return seat[0] || null;
}
