import { zValidator } from "@hono/zod-validator";
import {
  cancelSubscription,
  createCheckoutSession,
  createCustomerPortalSession,
  getSubscriptionDetails,
  resumeSubscription,
} from "@lydie/core/billing/checkout";
import {
  checkAndConsumeCredits,
  getUserCreditStatus,
  getWorkspaceMembersCreditStatus,
} from "@lydie/core/billing/workspace-credits";
import { db } from "@lydie/database";
import { Hono } from "hono";
import { z } from "zod";

type Variables = {
  user: any;
  organizationId: string;
  organizationSlug: string;
};

export const BillingRoute = new Hono<{ Variables: Variables }>()
  // Get credit status for current user in a workspace
  .get("/credits", async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");

    const creditStatus = await getUserCreditStatus(user.id, organizationId);

    if (!creditStatus) {
      return c.json({ error: "Credit record not found" }, 404);
    }

    return c.json(creditStatus);
  })
  .post(
    "/credits/check",
    zValidator(
      "json",
      z.object({
        creditsRequested: z.number().int().positive(),
        actionType: z.string(),
      }),
    ),
    async (c) => {
      const organizationId = c.get("organizationId");
      const user = c.get("user");
      const { creditsRequested, actionType } = c.req.valid("json");

      const creditStatus = await getUserCreditStatus(user.id, organizationId);

      if (!creditStatus) {
        return c.json({ error: "Credit record not found" }, 404);
      }

      const hasEnough = creditStatus.creditsAvailable >= creditsRequested;

      return c.json({
        allowed: hasEnough,
        creditsAvailable: creditStatus.creditsAvailable,
        creditsRequired: creditsRequested,
        requiresUpgrade: !hasEnough && creditStatus.plan === "free",
      });
    },
  )

  // Consume credits for an operation
  .post(
    "/credits/consume",
    zValidator(
      "json",
      z.object({
        creditsRequested: z.number().int().positive(),
        actionType: z.string(),
        resourceId: z.string().optional(),
      }),
    ),
    async (c) => {
      const organizationId = c.get("organizationId");
      const user = c.get("user");
      const { creditsRequested, actionType, resourceId } = c.req.valid("json");

      const result = await checkAndConsumeCredits(
        user.id,
        organizationId,
        creditsRequested,
        actionType,
        resourceId,
      );

      return c.json(result);
    },
  )

  // Get all members' credit status (admin only view)
  // Note: Membership already validated by organizationContext middleware
  .get("/credits/members", async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");

    // Check if user is owner (additional authorization beyond membership)
    const member = await db.query.membersTable.findFirst({
      where: { organizationId, userId: user.id },
    });

    if (!member || member.role !== "owner") {
      return c.json({ error: "Only owners can view all members' credits" }, 403);
    }

    const details = await getWorkspaceMembersCreditStatus(organizationId);

    if (!details) {
      return c.json({ error: "Workspace not found" }, 404);
    }

    return c.json(details);
  })

  // Get subscription details
  // Note: Membership already validated by organizationContext middleware
  .get("/subscription", async (c) => {
    const organizationId = c.get("organizationId");

    const details = await getSubscriptionDetails(organizationId);

    if (!details) {
      return c.json({ error: "Workspace not found" }, 404);
    }

    return c.json(details);
  })

  // Create checkout session for upgrading
  // Note: Membership already validated by organizationContext middleware
  .post("/checkout", async (c) => {
    const organizationId = c.get("organizationId");
    const organizationSlug = c.get("organizationSlug");
    const user = c.get("user");

    // Check if user is owner (workspace creator) - only owners can manage billing
    const member = await db.query.membersTable.findFirst({
      where: { organizationId, userId: user.id },
    });

    if (!member || member.role !== "owner") {
      return c.json({ error: "Only workspace owners can manage billing" }, 403);
    }

    try {
      // Parse plan from request body
      const body = await c.req.json().catch(() => ({}));
      const plan = body.plan === "yearly" ? "yearly" : "monthly";
      
      const origin = c.req.header("origin") || "https://app.lydie.ai";
      const successUrl = `${origin}/w/${organizationSlug}/settings/billing/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/w/${organizationSlug}/settings/billing`;
      
      const checkout = await createCheckoutSession(
        organizationId,
        user.id,
        successUrl,
        cancelUrl,
        plan,
      );

      return c.json(checkout);
    } catch (error: any) {
      console.error("[billing/checkout] ERROR:", error);
      return c.json({ error: error.message }, 400);
    }
  })

  // Create customer portal session
  // Note: Membership already validated by organizationContext middleware
  .post("/portal", async (c) => {
    const organizationId = c.get("organizationId");
    const organizationSlug = c.get("organizationSlug");
    const user = c.get("user");

    // Check if user is owner (additional authorization beyond membership)
    const member = await db.query.membersTable.findFirst({
      where: { organizationId, userId: user.id },
    });

    if (!member || member.role !== "owner") {
      return c.json({ error: "Only owners can access billing settings" }, 403);
    }

    try {
      const origin = c.req.header("origin") || "https://app.lydie.ai";
      const returnUrl = `${origin}/w/${organizationSlug}/settings/billing`;
      const portal = await createCustomerPortalSession(organizationId, returnUrl);

      return c.json(portal);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  })

  // Cancel subscription
  // Note: Membership already validated by organizationContext middleware
  .post("/cancel", async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");

    // Check if user is owner (additional authorization beyond membership)
    const member = await db.query.membersTable.findFirst({
      where: { organizationId, userId: user.id },
    });

    if (!member || member.role !== "owner") {
      return c.json({ error: "Only owners can cancel the subscription" }, 403);
    }

    try {
      const result = await cancelSubscription(organizationId);
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  })

  // Resume subscription
  // Note: Membership already validated by organizationContext middleware
  .post("/resume", async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");

    // Check if user is owner (additional authorization beyond membership)
    const member = await db.query.membersTable.findFirst({
      where: { organizationId, userId: user.id },
    });

    if (!member || member.role !== "owner") {
      return c.json({ error: "Only owners can resume the subscription" }, 403);
    }

    try {
      const result = await resumeSubscription(organizationId);
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  });
