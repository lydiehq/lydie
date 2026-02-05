import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { db, schema } from "@lydie/database";
import { eq } from "drizzle-orm";
import {
  getUserCreditStatus,
  checkAndConsumeCredits,
  getWorkspaceMembersCreditStatus,
  createCheckoutSession,
  createCustomerPortalSession,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionDetails,
  handleWebhookEvent,
  type PlanType,
} from "@lydie/core/billing";

const billingRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user; session: typeof auth.$Infer.Session.session } }>();

// Middleware to ensure user is authenticated
billingRouter.use("*", auth.middleware);

// Get credit status for current user in a workspace
billingRouter.get("/credits/:organizationId", async (c) => {
  const organizationId = c.req.param("organizationId");
  const user = c.get("user");

  // Check if user is member of this organization
  const member = await db.query.membersTable.findFirst({
    where: (members, { and, eq }) =>
      and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
  });

  if (!member) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }

  const creditStatus = await getUserCreditStatus(user.id, organizationId);

  if (!creditStatus) {
    return c.json({ error: "Credit record not found" }, 404);
  }

  return c.json(creditStatus);
});

// Check credits for an operation (without consuming)
billingRouter.post(
  "/credits/check/:organizationId",
  zValidator(
    "json",
    z.object({
      creditsRequested: z.number().int().positive(),
      actionType: z.string(),
    })
  ),
  async (c) => {
    const organizationId = c.req.param("organizationId");
    const user = c.get("user");
    const { creditsRequested, actionType } = c.req.valid("json");

    // Check membership
    const member = await db.query.membersTable.findFirst({
      where: (members, { and, eq }) =>
        and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
    });

    if (!member) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }

    // Just check, don't consume
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
  }
);

// Consume credits for an operation
billingRouter.post(
  "/credits/consume/:organizationId",
  zValidator(
    "json",
    z.object({
      creditsRequested: z.number().int().positive(),
      actionType: z.string(),
      resourceId: z.string().optional(),
    })
  ),
  async (c) => {
    const organizationId = c.req.param("organizationId");
    const user = c.get("user");
    const { creditsRequested, actionType, resourceId } = c.req.valid("json");

    // Check membership
    const member = await db.query.membersTable.findFirst({
      where: (members, { and, eq }) =>
        and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
    });

    if (!member) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }

    const result = await checkAndConsumeCredits(
      user.id,
      organizationId,
      creditsRequested,
      actionType,
      resourceId
    );

    return c.json(result);
  }
);

// Get all members' credit status (admin only view)
billingRouter.get("/credits/members/:organizationId", async (c) => {
  const organizationId = c.req.param("organizationId");
  const user = c.get("user");

  // Check if user is admin/owner
  const member = await db.query.membersTable.findFirst({
    where: (members, { and, eq }) =>
      and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
  });

  if (!member || member.role !== "admin") {
    return c.json({ error: "Only admins can view all members' credits" }, 403);
  }

  const details = await getWorkspaceMembersCreditStatus(organizationId);

  if (!details) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json(details);
});

// Get subscription details
billingRouter.get("/subscription/:organizationId", async (c) => {
  const organizationId = c.req.param("organizationId");
  const user = c.get("user");

  // Check membership
  const member = await db.query.membersTable.findFirst({
    where: (members, { and, eq }) =>
      and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
  });

  if (!member) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }

  const details = await getSubscriptionDetails(organizationId);

  if (!details) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json(details);
});

// Create checkout session for upgrading
billingRouter.post("/checkout/:organizationId", async (c) => {
  const organizationId = c.req.param("organizationId");
  const user = c.get("user");

  // Check if user is admin/owner
  const member = await db.query.membersTable.findFirst({
    where: (members, { and, eq }) =>
      and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
  });

  if (!member || member.role !== "admin") {
    return c.json({ error: "Only admins can upgrade the workspace" }, 403);
  }

  try {
    const successUrl = `${c.req.header("origin") || "https://app.lydie.ai"}/settings/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${c.req.header("origin") || "https://app.lydie.ai"}/settings/billing`;

    const checkout = await createCheckoutSession(
      organizationId,
      user.id,
      successUrl,
      cancelUrl
    );

    return c.json(checkout);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Create customer portal session
billingRouter.post("/portal/:organizationId", async (c) => {
  const organizationId = c.req.param("organizationId");
  const user = c.get("user");

  // Check if user is admin/owner
  const member = await db.query.membersTable.findFirst({
    where: (members, { and, eq }) =>
      and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
  });

  if (!member || member.role !== "admin") {
    return c.json({ error: "Only admins can access billing settings" }, 403);
  }

  try {
    const returnUrl = `${c.req.header("origin") || "https://app.lydie.ai"}/settings/billing`;
    const portal = await createCustomerPortalSession(organizationId, returnUrl);

    return c.json(portal);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Cancel subscription
billingRouter.post("/cancel/:organizationId", async (c) => {
  const organizationId = c.req.param("organizationId");
  const user = c.get("user");

  // Check if user is admin/owner
  const member = await db.query.membersTable.findFirst({
    where: (members, { and, eq }) =>
      and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
  });

  if (!member || member.role !== "admin") {
    return c.json({ error: "Only admins can cancel the subscription" }, 403);
  }

  try {
    const result = await cancelSubscription(organizationId);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Resume subscription
billingRouter.post("/resume/:organizationId", async (c) => {
  const organizationId = c.req.param("organizationId");
  const user = c.get("user");

  // Check if user is admin/owner
  const member = await db.query.membersTable.findFirst({
    where: (members, { and, eq }) =>
      and(eq(members.organizationId, organizationId), eq(members.userId, user.id)),
  });

  if (!member || member.role !== "admin") {
    return c.json({ error: "Only admins can resume the subscription" }, 403);
  }

  try {
    const result = await resumeSubscription(organizationId);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export { billingRouter };
