import { db, schema } from "@lydie/database";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { stripe, PLAN_CONFIG, type PlanType } from "./config";
import { getWorkspaceBilling, resetAllMemberCredits } from "./workspace-credits";

/**
 * Handle checkout.session.completed
 * Activate paid subscription after successful checkout
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const subscriptionId = session.subscription as string;

  if (!subscriptionId) {
    console.error("No subscription ID in checkout session", session.id);
    return;
  }

  // Retrieve the subscription to get metadata, period dates and determine plan
  // Note: metadata is stored in subscription_data.metadata during checkout creation
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const orgId = subscription.metadata?.organizationId;

  if (!orgId) {
    console.error("No organizationId in subscription metadata", subscriptionId);
    return;
  }

  // Determine plan from price interval
  const interval = subscription.items.data[0]?.price.recurring?.interval;
  const plan: PlanType = interval === "year" ? "yearly" : "monthly";

  // Get billing period from first subscription item (Stripe API 2025+ changed this structure)
  const subscriptionItem = subscription.items.data[0];

  // Update workspace billing
  await db
    .update(schema.workspaceBillingTable)
    .set({
      plan,
      stripeSubscriptionId: subscriptionId,
      stripeSubscriptionStatus: subscription.status,
      currentPeriodStart: subscriptionItem
        ? new Date(subscriptionItem.current_period_start * 1000)
        : null,
      currentPeriodEnd: subscriptionItem
        ? new Date(subscriptionItem.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, orgId));

  // Reset all members' credits with new plan limits
  await resetAllMemberCredits(orgId);

  console.log("Workspace upgraded to paid plan", {
    organizationId: orgId,
    subscriptionId,
    plan,
  });
}

/**
 * Handle invoice.paid
 * Confirm successful payment
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const billing = await db.query.workspaceBillingTable.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!billing) return;

  // Update status to active if it was past_due
  if (billing.stripeSubscriptionStatus === "past_due") {
    await db
      .update(schema.workspaceBillingTable)
      .set({
        stripeSubscriptionStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(schema.workspaceBillingTable.organizationId, billing.organizationId));
  }

  console.log("Invoice paid", {
    organizationId: billing.organizationId,
    invoiceId: invoice.id,
  });
}

/**
 * Handle invoice.payment_failed
 * Mark subscription as past_due
 */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const billing = await db.query.workspaceBillingTable.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!billing) return;

  await db
    .update(schema.workspaceBillingTable)
    .set({
      stripeSubscriptionStatus: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, billing.organizationId));

  console.log("Invoice payment failed", {
    organizationId: billing.organizationId,
    invoiceId: invoice.id,
  });

  // TODO: Send notification to billing owner
}

/**
 * Handle invoice.finalized
 * Trigger monthly/yearly credit reset for ALL members
 */
export async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const billing = await getWorkspaceBillingBySubscription(subscriptionId);
  if (!billing) return;

  // Reset all members' credits for new period
  await resetAllMemberCredits(billing.organizationId);

  console.log("Credits reset for all members for new billing period", {
    organizationId: billing.organizationId,
    plan: billing.plan,
  });
}

/**
 * Handle customer.subscription.updated
 * Sync subscription status changes
 */
export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.organizationId;
  if (!orgId) return;

  const billing = await getWorkspaceBilling(orgId);
  if (!billing) return;

  // Get billing period from first subscription item (Stripe API 2025+ changed this structure)
  const subscriptionItem = subscription.items.data[0];

  await db
    .update(schema.workspaceBillingTable)
    .set({
      stripeSubscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscriptionItem
        ? new Date(subscriptionItem.current_period_end * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, orgId));

  console.log("Subscription updated", {
    organizationId: orgId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

/**
 * Handle customer.subscription.deleted
 * Downgrade to free tier
 */
export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  let orgId = subscription.metadata?.organizationId;

  if (!orgId) {
    // Try to find by subscription ID
    const billing = await getWorkspaceBillingBySubscription(subscription.id);
    if (!billing) {
      console.error("Could not find workspace for deleted subscription", subscription.id);
      return;
    }
    orgId = billing.organizationId;
  }

  const planConfig = PLAN_CONFIG.free;

  // Downgrade workspace to free
  await db
    .update(schema.workspaceBillingTable)
    .set({
      plan: "free",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, orgId));

  // Reset all members to free tier credits (capped at 30)
  await db
    .update(schema.userWorkspaceCreditsTable)
    .set({
      creditsIncludedMonthly: planConfig.creditsPerMember,
      creditsAvailable: sql`LEAST(${schema.userWorkspaceCreditsTable.creditsAvailable}, ${planConfig.creditsPerMember})`,
      creditsUsedThisPeriod: 0,
      updatedAt: new Date(),
    })
    .where(eq(schema.userWorkspaceCreditsTable.organizationId, orgId));

  console.log("Workspace downgraded to Free, all members reset to 30 credits", {
    organizationId: orgId,
    subscriptionId: subscription.id,
  });
}

/**
 * Helper to find billing by subscription ID
 */
async function getWorkspaceBillingBySubscription(subscriptionId: string) {
  return await db.query.workspaceBillingTable.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });
}

/**
 * Webhook handler router
 */
export async function handleWebhookEvent(event: Stripe.Event) {
  console.log("Processing webhook event", {
    type: event.type,
    id: event.id,
  });

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case "invoice.finalized":
      await handleInvoiceFinalized(event.data.object as Stripe.Invoice);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    default:
      console.log("Unhandled webhook event type", event.type);
  }
}
