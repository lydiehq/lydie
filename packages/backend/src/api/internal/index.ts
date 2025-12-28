import { Hono } from "hono";
import { OrganizationRoute } from "./organization";
import { DocumentChatRoute } from "./document-chat";
import { AssistantRoute } from "./assistant";
import { MDXImportRoute } from "./mdx-import";
import { LLMReplaceRoute } from "./llm-replace";
import { IntegrationsRoute } from "./integrations";
import { WaitlistRoute } from "./waitlist";
import { VisibleError } from "@lydie/core/error";
import { authClient } from "@lydie/core/auth";
import { authenticatedWithOrganization } from "./middleware";
import { HTTPException } from "hono/http-exception";
import { ZeroRoute } from "./zero";

const publicRouter = new Hono()
  .on(["GET", "POST"], "/auth/*", async (c) => {
    return authClient.handler(c.req.raw);
  })
  .route("/waitlist", WaitlistRoute)
  .get("/yjs-token", async (c) => {
    // Get session to verify user is authenticated
    const session = await authClient.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.session) {
      throw new HTTPException(401, {
        message: "Unauthorized",
      });
    }

    // Extract token from cookie header
    const cookieHeader = c.req.header("Cookie") || "";
    const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
    
    for (const cookie of cookies) {
      if (cookie.startsWith("better-auth.session_token=")) {
        const token = cookie.substring("better-auth.session_token=".length);
        return c.json({ token });
      }
    }

    // Also check for secure cookie variant
    for (const cookie of cookies) {
      if (cookie.startsWith("__Secure-better-auth.session_token=")) {
        const token = cookie.substring("__Secure-better-auth.session_token=".length);
        return c.json({ token });
      }
    }

    throw new HTTPException(401, {
      message: "Session token not found",
    });
  });

const organizationScopedRouter = new Hono<{
  Variables: {
    user: any;
    session: any;
    organizationId: string;
  };
}>()
  .use("*", authenticatedWithOrganization)
  .route("/organization", OrganizationRoute)
  .route("/document-chat", DocumentChatRoute)
  .route("/assistant", AssistantRoute)
  .route("/mdx-import", MDXImportRoute)
  .route("/llm-replace", LLMReplaceRoute);

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

    // Handle HTTPException (including other status codes)
    if (err instanceof HTTPException) {
      // Add code field for specific status codes
      const response: { error: string; code?: string } = { error: err.message };

      if (err.status === 429) {
        response.code = "usage_limit_exceeded";
      }

      return c.json(response, err.status);
    }

    return c.json({ error: "Internal server error" }, 500);
  });
