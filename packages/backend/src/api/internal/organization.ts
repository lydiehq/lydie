import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { apiKeysTable, db } from "@lydie/database";
import { createId } from "@lydie/core/id";
import { createHash } from "crypto";
import { Resource } from "sst";

type Variables = {
  organizationId: string;
  user: any;
};

export const OrganizationRoute = new Hono<{ Variables: Variables }>().post(
  "/api-key",
  async (c) => {
    const organizationId = c.get("organizationId");
    const { name } = await c.req.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new HTTPException(400, {
        message: "API key name is required",
      });
    }

    const organization = await db.query.organizationsTable.findFirst({
      where: {
        id: organizationId,
      },
    });

    if (!organization) {
      throw new HTTPException(500, {
        message: "Organization not found",
      });
    }

    const stage = Resource.App.stage;
    const prefix = stage === "production" ? "lydie_live_" : "lydie_test_";
    const key = `${prefix}${createId()}`;

    const partialKey = `${key.slice(0, 8)}...${key.slice(-4)}`;
    const hashedKey = createHash("sha256").update(key).digest("hex");

    await db.insert(apiKeysTable).values({
      name: name.trim(),
      partialKey,
      hashedKey,
      organizationId: organization.id,
      revoked: false,
    });

    return c.json({
      key,
    });
  }
);
