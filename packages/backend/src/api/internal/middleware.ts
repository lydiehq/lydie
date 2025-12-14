import { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { authClient } from "@lydie/core/auth";
import { db } from "@lydie/database";

interface SessionAuthEnv {
  Variables: {
    user: typeof authClient.$Infer.Session.user | null;
    session: typeof authClient.$Infer.Session.session | null;
    organizationId: string;
  };
}

/**
 * BetterAuth session middleware that validates user sessions and sets user/session in context
 * Following the BetterAuth Hono integration pattern
 */
export const sessionAuth: MiddlewareHandler<SessionAuthEnv> = async (
  c,
  next
) => {
  const session = await authClient.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    throw new HTTPException(401, {
      message: "Unauthorized - No valid session",
    });
  }

  if (!session.session || !session.user) {
    c.set("user", null);
    c.set("session", null);
    throw new HTTPException(401, {
      message: "Unauthorized - Invalid session",
    });
  }

  c.set("user", session.user);
  c.set("session", session.session);

  return next();
};

/**
 * Organization context middleware that validates and sets organization context
 * Requires sessionAuth to be run first
 */
export const organizationContext: MiddlewareHandler<SessionAuthEnv> = async (
  c,
  next
) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, {
      message: "Unauthorized - User not found in context",
    });
  }

  const organizationId = c.req.header("X-Organization-Id");
  if (!organizationId) {
    throw new HTTPException(400, {
      message: "Organization ID is required",
    });
  }

  // Verify user has access to this organization
  const organization = await db.query.organizationsTable.findFirst({
    where: {
      id: organizationId,
    },
    with: {
      members: {
        where: {
          userId: user.id,
        },
      },
    },
  });

  if (!organization || organization.members.length === 0) {
    throw new HTTPException(403, {
      message: "Access denied - User is not a member of this organization",
    });
  }

  c.set("organizationId", organizationId);
  return next();
};

/**
 * Combined middleware that handles both session auth and organization context
 * This is a convenience middleware that combines sessionAuth + organizationContext
 */
export const authenticatedWithOrganization: MiddlewareHandler<
  SessionAuthEnv
> = async (c, next) => {
  await sessionAuth(c, async () => {
    await organizationContext(c, next);
  });
};
