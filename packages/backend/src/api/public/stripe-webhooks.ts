import { stripe } from "@lydie/core/billing/config";
import { handleWebhookEvent } from "@lydie/core/billing/webhooks";
import { Hono } from "hono";
import type Stripe from "stripe";

import { env } from "../../env";

export const stripeWebhookRouter = new Hono();

/**
 * Stripe webhook endpoint
 * Receives events from Stripe and processes them
 */
stripeWebhookRouter.post("/stripe", async (c) => {
  const payload = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing Stripe signature" }, 400);
  }

  // Get webhook secret from environment
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return c.json({ error: "Invalid signature" }, 400);
  }

  // Process the webhook event
  try {
    await handleWebhookEvent(event);
    return c.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    // Still return 200 to prevent Stripe from retrying
    // (we'll handle the error internally)
    return c.json({ received: true });
  }
});
