import { createHash } from "crypto";

import { app } from "@lydie/backend/api";
import { createId } from "@lydie/core/id";
import { apiKeysTable, db, documentsTable } from "@lydie/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createTestUser } from "./e2e/utils/db";

function createRawApiKey(): string {
  const stage = process.env.APP_STAGE || "development";
  const prefix = stage === "production" ? "lydie_live_" : "lydie_test_";
  return `${prefix}${createId()}`;
}

async function createApiKey(
  organizationId: string,
  options?: { revoked?: boolean; lastUsedAt?: Date | null },
) {
  const key = createRawApiKey();
  const partialKey = `${key.slice(0, 8)}...${key.slice(-4)}`;
  const hashedKey = createHash("sha256").update(key).digest("hex");

  const [apiKey] = await db
    .insert(apiKeysTable)
    .values({
      name: `REST API Test Key ${Date.now()}`,
      partialKey,
      hashedKey,
      organizationId,
      revoked: options?.revoked ?? false,
      lastUsedAt: options?.lastUsedAt,
    })
    .returning();

  if (!apiKey) {
    throw new Error("Failed to create API key");
  }

  return { apiKey, key };
}

async function createPublishedDocument(organizationId: string) {
  const [document] = await db
    .insert(documentsTable)
    .values({
      id: createId(),
      title: `REST API Test Document ${Date.now()}`,
      organizationId,
      published: true,
    })
    .returning();

  if (!document) {
    throw new Error("Failed to create document");
  }

  return document;
}

describe("API key REST API", () => {
  it("should reject requests with revoked API key", async () => {
    const { organization, cleanup } = await createTestUser({ prefix: "api-revoked" });
    const document = await createPublishedDocument(organization.id);
    const { apiKey, key } = await createApiKey(organization.id, { revoked: true });

    try {
      const response = await app.request(`/v1/${organization.id}/documents/${document.id}`, {
        headers: new Headers({ Authorization: `Bearer ${key}` }),
      });

      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.message || error.error).toContain("Invalid or revoked");
    } finally {
      await db.delete(documentsTable).where(eq(documentsTable.id, document.id));
      await db.delete(apiKeysTable).where(eq(apiKeysTable.id, apiKey.id));
      await cleanup();
    }
  });

  it("should reject API key from different organization", async () => {
    const firstUser = await createTestUser({ prefix: "api-org-a" });
    const secondUser = await createTestUser({ prefix: "api-org-b" });
    const document = await createPublishedDocument(firstUser.organization.id);
    const { apiKey, key } = await createApiKey(secondUser.organization.id);

    try {
      const response = await app.request(
        `/v1/${firstUser.organization.id}/documents/${document.id}`,
        {
          headers: new Headers({ Authorization: `Bearer ${key}` }),
        },
      );

      expect(response.status).toBe(403);
      const error = await response.json();
      expect(error.message || error.error || JSON.stringify(error)).toContain(
        "does not have access",
      );
    } finally {
      await db.delete(documentsTable).where(eq(documentsTable.id, document.id));
      await db.delete(apiKeysTable).where(eq(apiKeysTable.id, apiKey.id));
      await firstUser.cleanup();
      await secondUser.cleanup();
    }
  });

  it("should reject requests without API key", async () => {
    const { organization, cleanup } = await createTestUser({ prefix: "api-no-key" });
    const document = await createPublishedDocument(organization.id);

    try {
      const response = await app.request(`/v1/${organization.id}/documents/${document.id}`);

      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.message || error.error).toContain("No API key provided");
    } finally {
      await db.delete(documentsTable).where(eq(documentsTable.id, document.id));
      await cleanup();
    }
  });

  it("should reject requests with invalid API key format", async () => {
    const { organization, cleanup } = await createTestUser({ prefix: "api-invalid" });
    const document = await createPublishedDocument(organization.id);

    try {
      const response = await app.request(`/v1/${organization.id}/documents/${document.id}`, {
        headers: new Headers({ Authorization: "Bearer invalid-key-format" }),
      });

      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.message || error.error).toContain("Invalid");
    } finally {
      await db.delete(documentsTable).where(eq(documentsTable.id, document.id));
      await cleanup();
    }
  });

  it("should update lastUsedAt when API key is used", async () => {
    const { organization, cleanup } = await createTestUser({ prefix: "api-last-used" });
    const document = await createPublishedDocument(organization.id);
    const { apiKey, key } = await createApiKey(organization.id, { lastUsedAt: null });

    try {
      const response = await app.request(`/v1/${organization.id}/documents/${document.id}`, {
        headers: new Headers({ Authorization: `Bearer ${key}` }),
      });

      expect(response.status).toBe(200);

      const [updatedKey] = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.id, apiKey.id))
        .limit(1);

      expect(updatedKey?.lastUsedAt).not.toBeNull();
      expect(updatedKey?.lastUsedAt).toBeInstanceOf(Date);
    } finally {
      await db.delete(documentsTable).where(eq(documentsTable.id, document.id));
      await db.delete(apiKeysTable).where(eq(apiKeysTable.id, apiKey.id));
      await cleanup();
    }
  });
});
