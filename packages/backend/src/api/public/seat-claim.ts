import { handleSeatClaimed } from "@lydie/core/billing/billing-sync";
import { claimSeat, getSeatClaimInfo } from "@lydie/core/billing/seat-management";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Public Seat Claim API Routes
 *
 * These endpoints are publicly accessible for the seat claim flow.
 * Users receive invitation emails with tokens and claim seats without
 * needing to be pre-authenticated.
 */
export const SeatClaimRoute = new Hono()
  /**
   * GET /api/seats/claim/info?token=xxx
   * Get claim information for an invitation token
   * This is called when loading the claim page to show what the user is claiming
   */
  .get("/info", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      throw new HTTPException(400, {
        message: "Invitation token is required",
      });
    }

    try {
      const claimInfo = await getSeatClaimInfo(token);

      return c.json({
        success: true,
        data: claimInfo,
      });
    } catch (error: any) {
      console.error("Error getting claim info:", error);
      throw new HTTPException(500, {
        message: error.message || "Failed to get claim information",
      });
    }
  })

  /**
   * POST /api/seats/claim
   * Claim a seat using an invitation token
   *
   * Body:
   * - token: Invitation token from the email
   * - userId: ID of the user claiming the seat (must be logged in)
   */
  .post("/", async (c) => {
    const body = await c.req.json();
    const { token, userId } = body;

    if (!token || typeof token !== "string") {
      throw new HTTPException(400, {
        message: "Invitation token is required",
      });
    }

    if (!userId || typeof userId !== "string") {
      throw new HTTPException(400, {
        message: "User ID is required",
      });
    }

    try {
      const result = await claimSeat(token, userId);

      if (!result.success) {
        throw new HTTPException(400, {
          message: result.error || "Failed to claim seat",
        });
      }

      // After claiming the seat, ensure the user becomes a member
      // This links the billing seat to the organization membership
      if (result.seat) {
        try {
          const membershipResult = await handleSeatClaimed(
            result.seat.organizationId,
            result.seat.assignedEmail,
            userId,
          );

          if (!membershipResult.success) {
            console.warn("Failed to add member after seat claim:", membershipResult.error);
            // Don't fail the claim if membership fails - they can be added later
          }
        } catch (memberError) {
          console.error("Error adding member after seat claim:", memberError);
          // Don't fail the claim if membership creation fails
        }
      }

      return c.json({
        success: true,
        data: {
          seat: result.seat,
          customerSessionToken: result.customerSessionToken,
        },
      });
    } catch (error: any) {
      console.error("Error claiming seat:", error);

      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: error.message || "Failed to claim seat",
      });
    }
  });
