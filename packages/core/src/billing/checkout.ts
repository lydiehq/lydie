import { db, schema } from "@lydie/database";
import { eq } from "drizzle-orm";
import { stripe, STRIPE_PRICE_IDS } from "./config";
import { getOrCreateStripeCustomer, getWorkspaceBilling } from "./workspace-credits";
import type Stripe from "stripe";

/**
 * Create a Stripe Checkout session for upgrading to Pro
 */
export async function createCheckoutSession(
  organizationId: string,
  billingOwnerUserId: string,
  successUrl: string,
  cancelUrl: string
) {
  // Get billing owner and ensure they have a Stripe customer
  const user = await db.query.usersTable.findFirst({
    where: eq(schema.usersTable.id, billingOwnerUserId),
  });

  if (!user) {
    throw new Error("Billing owner not found");
  }

  const stripeCustomer = await getOrCreateStripeCustomer(billingOwnerUserId, user.email);

  // Check if workspace already has an active subscription
  const billing = await getWorkspaceBilling(organizationId);
  if (billing?.plan === "pro" && billing.stripeSubscriptionStatus === "active") {
    throw new Error("Workspace already has an active Pro subscription");
  }

  // Create Checkout session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomer.id,
    mode: "subscription",
    line_items: [
      {
        price: STRIPE_PRICE_IDS.proBase,
        quantity: 1,
      },
      {
        price: STRIPE_PRICE_IDS.proOverage,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: {
        organizationId,
        billingOwnerUserId,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: "required",
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Create a Customer Portal session for managing billing
 */
export async function createCustomerPortalSession(
  organizationId: string,
  returnUrl: string
) {
  const billing = await getWorkspaceBilling(organizationId);

  if (!billing || billing.plan !== "pro") {
    throw new Error("Customer portal is only available for Pro workspaces");
  }

  // Get Stripe customer from billing owner
  const stripeCustomer = await db.query.stripeCustomersTable.findFirst({
    where: eq(schema.stripeCustomersTable.userId, billing.billingOwnerUserId),
  });

  if (!stripeCustomer) {
    throw new Error("No Stripe customer found for this workspace");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomer.id,
    return_url: returnUrl,
  });

  return {
    url: session.url,
  };
}

/**
 * Cancel subscription (downgrade at period end)
 */
export async function cancelSubscription(organizationId: string) {
  const billing = await getWorkspaceBilling(organizationId);

  if (!billing?.stripeSubscriptionId) {
    throw new Error("No active subscription found");
  }

  // Cancel at period end (graceful downgrade)
  await stripe.subscriptions.update(billing.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  // Update local state
  await db
    .update(schema.workspaceBillingTable)
    .set({
      cancelAtPeriodEnd: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, organizationId));

  return {
    success: true,
    message: "Subscription will be canceled at the end of the current billing period",
  };
}

/**
 * Resume a subscription that was scheduled for cancellation
 */
export async function resumeSubscription(organizationId: string) {
  const billing = await getWorkspaceBilling(organizationId);

  if (!billing?.stripeSubscriptionId) {
    throw new Error("No active subscription found");
  }

  if (!billing.cancelAtPeriodEnd) {
    throw new Error("Subscription is not scheduled for cancellation");
  }

  // Resume the subscription
  await stripe.subscriptions.update(billing.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  // Update local state
  await db
    .update(schema.workspaceBillingTable)
    .set({
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaceBillingTable.organizationId, organizationId));

  return {
    success: true,
    message: "Subscription resumed successfully",
  };
}

/**
 * Get subscription details for display
 */
export async function getSubscriptionDetails(organizationId: string) {
  const billing = await getWorkspaceBilling(organizationId);

  if (!billing) {
    return null;
  }

  let subscriptionDetails: {
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    nextInvoiceAmount: number | null;
  } | null = null;

  if (billing.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId);

      // Get upcoming invoice
      let nextInvoiceAmount: number | null = null;
      try {
        const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
          customer: subscription.customer as string,
          subscription: billing.stripeSubscriptionId,
        });
        nextInvoiceAmount = upcomingInvoice.amount_due;
      } catch {
        // No upcoming invoice yet
      }

      subscriptionDetails = {
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        nextInvoiceAmount,
      };
    } catch (error) {
      console.error("Error fetching subscription details", error);
    }
  }

  return {
    plan: billing.plan,
    status: billing.stripeSubscriptionStatus,
    creditsIncluded: billing.creditsIncludedMonthly,
    creditsUsed: billing.creditsUsedThisPeriod,
    creditsAvailable: billing.creditsAvailable,
    overageEnabled: billing.overageEnabled,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    ...subscriptionDetails,
  };
}
