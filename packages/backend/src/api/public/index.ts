import { Hono } from "hono";

import { publicRateLimit } from "./middleware";
import { stripeWebhookRouter } from "./stripe-webhooks";
import TemplateInstallRoute from "./template-install";
import { ToolsRoute } from "./tools";

export const PublicApi = new Hono()
  .use(publicRateLimit)
  .route("/template-install", TemplateInstallRoute)
  .route("/tools", ToolsRoute)
  .route("/webhooks", stripeWebhookRouter);
