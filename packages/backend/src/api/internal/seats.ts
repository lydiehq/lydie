import {
  assignSeat,
  assignMultipleSeats,
  getSeatInfo,
  getAllOrganizationSeats,
  getSeatStats,
  revokeSeat,
  resendSeatInvitation,
} from "@lydie/core/billing/seat-management";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

type Variables = {
  organizationId: string;
  user: any;
};

/**
 * Seat Management API Routes
 * 
 * These endpoints allow billing managers to manage seat assignments
 * for their organization's subscription or orders.
 */
export const SeatsRoute = new Hono<{ Variables: Variables }>()
  /**
   * GET /api/seats
   * Get seat information for the current organization
   * 
   * Query params:
   * - subscriptionId: Optional subscription ID to filter by
   * - orderId: Optional order ID to filter by
   */
  .get("/", async (c) => {
    const organizationId = c.get("organizationId");
    const { subscriptionId, orderId } = c.req.query();

    try {
      let seatInfo;
      
      if (subscriptionId || orderId) {
        // Get seats for specific subscription/order
        seatInfo = await getSeatInfo(organizationId, {
          subscriptionId,
          orderId,
        });
      } else {
        // Get all seats for the organization
        seatInfo = await getAllOrganizationSeats(organizationId);
      }

      return c.json({
        success: true,
        data: seatInfo,
      });
    } catch (error: any) {
      console.error("Error getting seat info:", error);
      throw new HTTPException(500, {
        message: error.message || "Failed to get seat information",
      });
    }
  })

  /**
   * GET /api/seats/stats
   * Get seat statistics for the organization
   */
  .get("/stats", async (c) => {
    const organizationId = c.get("organizationId");

    try {
      const stats = await getSeatStats(organizationId);

      return c.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("Error getting seat stats:", error);
      throw new HTTPException(500, {
        message: error.message || "Failed to get seat statistics",
      });
    }
  })

  /**
   * POST /api/seats/assign
   * Assign a seat to an email address
   * 
   * Body:
   * - email: Email address to assign seat to
   * - subscriptionId: Optional subscription ID (required if no orderId)
   * - orderId: Optional order ID (required if no subscriptionId)
   * - metadata: Optional metadata (e.g., { role: "Developer", department: "Engineering" })
   */
  .post("/assign", async (c) => {
    const organizationId = c.get("organizationId");
    const body = await c.req.json();
    const { email, subscriptionId, orderId, metadata } = body;

    if (!email || typeof email !== "string") {
      throw new HTTPException(400, {
        message: "Email is required",
      });
    }

    if (!subscriptionId && !orderId) {
      throw new HTTPException(400, {
        message: "Either subscriptionId or orderId is required",
      });
    }

    try {
      const result = await assignSeat(
        organizationId,
        { subscriptionId, orderId },
        email,
        metadata
      );

      if (!result.success) {
        throw new HTTPException(400, {
          message: result.error || "Failed to assign seat",
        });
      }

      return c.json({
        success: true,
        data: result.seat,
      });
    } catch (error: any) {
      console.error("Error assigning seat:", error);
      
      if (error instanceof HTTPException) {
        throw error;
      }
      
      throw new HTTPException(500, {
        message: error.message || "Failed to assign seat",
      });
    }
  })

  /**
   * POST /api/seats/assign-bulk
   * Assign seats to multiple email addresses at once
   * 
   * Body:
   * - emails: Array of email addresses to assign seats to
   * - subscriptionId: Optional subscription ID
   * - orderId: Optional order ID
   * - metadata: Optional metadata for all seats
   */
  .post("/assign-bulk", async (c) => {
    const organizationId = c.get("organizationId");
    const body = await c.req.json();
    const { emails, subscriptionId, orderId, metadata } = body;

    if (!Array.isArray(emails) || emails.length === 0) {
      throw new HTTPException(400, {
        message: "Emails array is required and must not be empty",
      });
    }

    if (!subscriptionId && !orderId) {
      throw new HTTPException(400, {
        message: "Either subscriptionId or orderId is required",
      });
    }

    try {
      const result = await assignMultipleSeats(
        organizationId,
        { subscriptionId, orderId },
        emails,
        metadata
      );

      return c.json({
        success: true,
        data: {
          succeeded: result.succeeded,
          failed: result.failed,
          errors: result.errors,
          seats: result.seats,
        },
      });
    } catch (error: any) {
      console.error("Error bulk assigning seats:", error);
      throw new HTTPException(500, {
        message: error.message || "Failed to assign seats",
      });
    }
  })

  /**
   * POST /api/seats/:seatId/revoke
   * Revoke a seat
   */
  .post("/:seatId/revoke", async (c) => {
    const seatId = c.req.param("seatId");

    if (!seatId) {
      throw new HTTPException(400, {
        message: "Seat ID is required",
      });
    }

    try {
      const result = await revokeSeat(seatId);

      if (!result.success) {
        throw new HTTPException(400, {
          message: result.error || "Failed to revoke seat",
        });
      }

      return c.json({
        success: true,
        data: result.seat,
      });
    } catch (error: any) {
      console.error("Error revoking seat:", error);
      
      if (error instanceof HTTPException) {
        throw error;
      }
      
      throw new HTTPException(500, {
        message: error.message || "Failed to revoke seat",
      });
    }
  })

  /**
   * POST /api/seats/:seatId/resend
   * Resend a seat invitation
   */
  .post("/:seatId/resend", async (c) => {
    const seatId = c.req.param("seatId");

    if (!seatId) {
      throw new HTTPException(400, {
        message: "Seat ID is required",
      });
    }

    try {
      const result = await resendSeatInvitation(seatId);

      if (!result.success) {
        throw new HTTPException(400, {
          message: result.error || "Failed to resend invitation",
        });
      }

      return c.json({
        success: true,
        data: result.seat,
      });
    } catch (error: any) {
      console.error("Error resending invitation:", error);
      
      if (error instanceof HTTPException) {
        throw error;
      }
      
      throw new HTTPException(500, {
        message: error.message || "Failed to resend invitation",
      });
    }
  });
