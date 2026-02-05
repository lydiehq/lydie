import type Stripe from "stripe";
import { db, schema } from "@lydie/database";
import { eq } from "drizzle-orm";
import { stripe, getPlanConfig, type PlanType } from "../config";
import { getWorkspaceBilling } from "../workspace-credits";

/**
 * Handle checkout.session.completed
 * Activate Pro subscription after successful checkout
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const subscriptionId = session.subscription as string;
  const orgId = session.metadata?.organizationId;

  if (!orgId) {
    console.error("No organizationId in checkout session metadata", session.id);
    return;
  }

  // Retrieve the subscription to get period dates
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Update workspace to Pro
  await db
    .update(schema.workspaceBillingTable)
    .set({
      plan: "pro",
      stripeSubscriptionId: subscriptionId,
      stripeSubscriptionStatus: subscription.status,
      creditsIncludedMonthly: 800,
      creditsAvailable: 800,
      creditsUsedThisPeriod: 0,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      overageEnabled: true,
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, orgId));

  console.log("Workspace upgraded to Pro", {
    organizationId: orgId,
    subscriptionId,
  });
}

/**
 * Handle invoice.paid
 * Confirm successful payment
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const billing = await db.query.workspaceBillingTable.findFirst({
    where: eq(schema.workspaceBillingTable.stripeSubscriptionId, subscriptionId),
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
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const billing = await db.query.workspaceBillingTable.findFirst({
    where: eq(schema.workspaceBillingTable.stripeSubscriptionId, subscriptionId),
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
 * Trigger monthly credit reset for new billing period
 */
export async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const billing = await getWorkspaceBillingBySubscription(subscriptionId);
  if (!billing) return;

  const planConfig = getPlanConfig(billing.plan as PlanType);

  // Reset credits for new period
  await db
    .update(schema.workspaceBillingTable)
    .set({
      creditsUsedThisPeriod: 0,
      creditsAvailable: planConfig.creditsPerMonth,
      currentPeriodStart: new Date(invoice.period_start * 1000),
      currentPeriodEnd: new Date(invoice.period_end * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, billing.organizationId));

  console.log("Credits reset for new billing period", {
    organizationId: billing.organizationId,
    creditsAvailable: planConfig.creditsPerMonth,
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

  await db
    .update(schema.workspaceBillingTable)
    .set({
      stripeSubscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
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

  // Downgrade to free
  await db
    .update(schema.workspaceBillingTable)
    .set({
      plan: "free",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      creditsIncludedMonthly: 30,
      creditsAvailable: Math.min(30, billing?.creditsAvailable || 30),
      overageEnabled: false,
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, orgId));

  console.log("Workspace downgraded to Free", {
    organizationId: orgId,
    subscriptionId: subscription.id,
  });
}

/**
 * Helper to find billing by subscription ID
 */
async function getWorkspaceBillingBySubscription(subscriptionId: string) {
  return await db.query.workspaceBillingTable.findFirst({
    where: eq(schema.workspaceBillingTable.stripeSubscriptionId, subscriptionId),
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
