import { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { db, apiKeysTable } from "@lydie/database";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";

interface ApiAuthEnv {
  Variables: {
    organizationId: string;
  };
}

export const apiKeyAuth: MiddlewareHandler<ApiAuthEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    throw new HTTPException(401, {
      message: "No API key provided",
    });
  }

  const key = authHeader.split(" ")[1];

  if (!key) {
    throw new HTTPException(401, {
      message: "Invalid API key",
    });
  }

  const hashedKey = createHash("sha256").update(key).digest("hex");

  const apiKey = await db.query.apiKeysTable.findFirst({
    where: {
      AND: [{ hashedKey }, { revoked: false }],
    },
  });

  if (!apiKey) {
    throw new HTTPException(401, {
      message: "Invalid or revoked API key",
    });
  }

  const idOrSlug = c.req.param("idOrSlug");

  const organization = await db.query.organizationsTable.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
  });

  if (!organization) {
    throw new HTTPException(404, {
      message: "Organization not found",
    });
  }

  // Validate that the API key belongs to the organization specified in the URL
  if (apiKey.organizationId !== organization.id) {
    throw new HTTPException(403, {
      message: "API key does not have access to this organization",
    });
  }

  // Update lastUsedAt timestamp (track usage)
  // This is a lightweight operation - just updating a timestamp field
  // We update it on every request to ensure accurate tracking
  await db
    .update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, apiKey.id));

  c.set("organizationId", apiKey.organizationId);
  await next();
};
