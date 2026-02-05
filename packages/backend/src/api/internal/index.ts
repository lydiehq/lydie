import { authClient } from "@lydie/core/auth";
import { VisibleError } from "@lydie/core/error";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { AssistantRoute } from "./assistant";
import { ImagesRoute } from "./images";
import { IntegrationsRoute } from "./integrations";
import { LLMReplaceRoute } from "./llm-replace";
import { MDXImportRoute } from "./mdx-import";
import { authenticatedWithOrganization, internalRateLimit } from "./middleware";
import { OrganizationRoute } from "./organization";
import { billingRouter } from "../billing";
import { ZeroRoute } from "./zero";

const publicRouter = new Hono().on(["GET", "POST"], "/auth/*", async (c) => {
  return authClient.handler(c.req.raw);
});

const organizationScopedRouter = new Hono<{
  Variables: {
    user: any;
    session: any;
    organizationId: string;
  };
}>()
  .use("*", internalRateLimit)
  .use("*", authenticatedWithOrganization)
  .route("/organization", OrganizationRoute)
  .route("/assistant", AssistantRoute)
  .route("/mdx-import", MDXImportRoute)
  .route("/llm-replace", LLMReplaceRoute)
  .route("/images", ImagesRoute)
  .route("/billing", billingRouter);

export const InternalApi = new Hono()
  .route("/public", publicRouter)
  .route("/zero", ZeroRoute)
  .route("/integrations", IntegrationsRoute)
  .route("/", organizationScopedRouter)
  .onError((err, c) => {
    console.error(err);

    if (err instanceof VisibleError) {
      return c.json({ error: err.message, code: err.code }, err.status as any);
    }

    if (err instanceof HTTPException) {
      const response: { error: string; code?: string } = { error: err.message };

      if (err.status === 429) {
        response.code = "usage_limit_exceeded";
      }

      return c.json(response, err.status);
    }

    return c.json({ error: "Internal server error" }, 500);
  });
