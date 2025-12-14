import { test, expect } from "./fixtures/auth.fixture";
import { db, apiKeysTable } from "@lydie/database";
import { eq } from "drizzle-orm";
import { createTestUser } from "./utils/db";

test.describe("API key REST API", () => {
  test("should authenticate with API key to external API", async ({
    page,
    organization,
  }) => {
    // Navigate to a page first to establish base URL
    await page.goto(`/w/${organization.id}/settings`);
    await page.waitForURL(`/w/${organization.id}/settings`, { timeout: 5000 });

    // Create an API key through the UI
    await page
      .getByRole("button", { name: /Create API Key/i })
      .first()
      .click();

    await expect(
      page.getByRole("heading", { name: /Create API Key/i })
    ).toBeVisible();

    const apiKeyName = `Auth Test Key ${Date.now()}`;
    await page.getByLabel(/Name/i).fill(apiKeyName);

    await page
      .getByRole("button", { name: /Create API Key/i })
      .filter({ hasText: /Create API Key/i })
      .click();

    await expect(
      page.getByText(/API Key Created Successfully/i)
    ).toBeVisible({ timeout: 5000 });

    // Get the full API key value
    const apiKeyValue = await page
      .locator('input[readonly], textarea[readonly]')
      .first()
      .inputValue();

    expect(apiKeyValue).toBeTruthy();
    expect(
      apiKeyValue.startsWith("lydie_test_") ||
        apiKeyValue.startsWith("lydie_live_")
    ).toBe(true);

    // Close the dialog
    await page.getByRole("button", { name: /Close/i }).click();

    // Get the API base URL from the page URL
    const pageURL = new URL(page.url());
    const baseURL = `${pageURL.protocol}//${pageURL.host}`;
    const apiURL =
      process.env.VITE_API_URL || baseURL.replace(":3000", ":3001");

    // Test the API key by making a request to the external API
    const response = await page.request.get(
      `${apiURL}/v1/${organization.id}/documents`,
      {
        headers: {
          Authorization: `Bearer ${apiKeyValue}`,
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("documents");
    expect(Array.isArray(data.documents)).toBe(true);

    // Cleanup: Find and revoke the created API key
    const apiKeys = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.organizationId, organization.id));

    const createdKey = apiKeys.find((k) => k.name === apiKeyName);
    if (createdKey) {
      await db
        .update(apiKeysTable)
        .set({ revoked: true })
        .where(eq(apiKeysTable.id, createdKey.id));
    }
  });

  test("should reject requests with revoked API key", async ({
    page,
    organization,
  }) => {
    // Navigate to a page first to establish base URL
    await page.goto(`/w/${organization.id}`);
    await page.waitForURL(`/w/${organization.id}`, { timeout: 5000 });

    // Create an API key directly in the database
    const { createHash } = await import("crypto");
    const { createId } = await import("@lydie/core/id");
    const { Resource } = await import("sst");

    const stage = Resource.App.stage;
    const prefix = stage === "production" ? "lydie_live_" : "lydie_test_";
    const key = `${prefix}${createId()}`;
    const partialKey = `${key.slice(0, 8)}...${key.slice(-4)}`;
    const hashedKey = createHash("sha256").update(key).digest("hex");

    const [createdKey] = await db
      .insert(apiKeysTable)
      .values({
        name: `Revoked Test Key ${Date.now()}`,
        partialKey,
        hashedKey,
        organizationId: organization.id,
        revoked: false,
      })
      .returning();

    try {
      // Revoke the key
      await db
        .update(apiKeysTable)
        .set({ revoked: true })
        .where(eq(apiKeysTable.id, createdKey.id));

      // Try to use the revoked key
      const pageURL = new URL(page.url());
      const baseURL = `${pageURL.protocol}//${pageURL.host}`;
      const apiURL =
        process.env.VITE_API_URL || baseURL.replace(":3000", ":3001");

      const response = await page.request.get(
        `${apiURL}/v1/${organization.id}/documents`,
        {
          headers: {
            Authorization: `Bearer ${key}`,
          },
        }
      );

      expect(response.status()).toBe(401);
      const error = await response.json();
      expect(error.message || error.error).toContain("Invalid or revoked");
    } finally {
      // Cleanup
      await db
        .delete(apiKeysTable)
        .where(eq(apiKeysTable.id, createdKey.id));
    }
  });

  test("should reject API key from different organization", async ({
    page,
    organization,
  }) => {
    // Navigate to a page first to establish base URL
    await page.goto(`/w/${organization.id}`);
    await page.waitForURL(`/w/${organization.id}`, { timeout: 5000 });

    // Create a different organization and API key
    const { organization: otherOrg, cleanup } = await createTestUser({
      prefix: "other-org",
    });

    try {
      const { createHash } = await import("crypto");
      const { createId } = await import("@lydie/core/id");
      const { Resource } = await import("sst");

      const stage = Resource.App.stage;
      const prefix = stage === "production" ? "lydie_live_" : "lydie_test_";
      const key = `${prefix}${createId()}`;
      const partialKey = `${key.slice(0, 8)}...${key.slice(-4)}`;
      const hashedKey = createHash("sha256").update(key).digest("hex");

      const [otherOrgKey] = await db
        .insert(apiKeysTable)
        .values({
          name: `Other Org Key ${Date.now()}`,
          partialKey,
          hashedKey,
          organizationId: otherOrg.id,
          revoked: false,
        })
        .returning();

      try {
        // Try to use the other organization's key with this organization's ID
        const pageURL = new URL(page.url());
        const baseURL = `${pageURL.protocol}//${pageURL.host}`;
        const apiURL =
          process.env.VITE_API_URL || baseURL.replace(":3000", ":3001");

        const response = await page.request.get(
          `${apiURL}/v1/${organization.id}/documents`,
          {
            headers: {
              Authorization: `Bearer ${key}`,
            },
          }
        );

        expect(response.status()).toBe(403);
        const error = await response.json();
        expect(
          error.message || error.error || JSON.stringify(error)
        ).toContain("does not have access");
      } finally {
        // Cleanup other org key
        await db
          .delete(apiKeysTable)
          .where(eq(apiKeysTable.id, otherOrgKey.id));
      }
    } finally {
      await cleanup();
    }
  });

  test("should reject requests without API key", async ({ page, organization }) => {
    // Navigate to a page first to establish base URL
    await page.goto(`/w/${organization.id}`);
    await page.waitForURL(`/w/${organization.id}`, { timeout: 5000 });

    const pageURL = new URL(page.url());
    const baseURL = `${pageURL.protocol}//${pageURL.host}`;
    const apiURL =
      process.env.VITE_API_URL || baseURL.replace(":3000", ":3001");

    const response = await page.request.get(
      `${apiURL}/v1/${organization.id}/documents`
    );

    expect(response.status()).toBe(401);
    const error = await response.json();
    expect(error.message || error.error).toContain("No API key provided");
  });

  test("should reject requests with invalid API key format", async ({
    page,
    organization,
  }) => {
    // Navigate to a page first to establish base URL
    await page.goto(`/w/${organization.id}`);
    await page.waitForURL(`/w/${organization.id}`, { timeout: 5000 });

    const pageURL = new URL(page.url());
    const baseURL = `${pageURL.protocol}//${pageURL.host}`;
    const apiURL =
      process.env.VITE_API_URL || baseURL.replace(":3000", ":3001");

    const response = await page.request.get(
      `${apiURL}/v1/${organization.id}/documents`,
      {
        headers: {
          Authorization: "Bearer invalid-key-format",
        },
      }
    );

    expect(response.status()).toBe(401);
    const error = await response.json();
    expect(error.message || error.error).toContain("Invalid");
  });

  test("should update lastUsedAt when API key is used", async ({
    page,
    organization,
  }) => {
    // Navigate to a page first to establish base URL
    await page.goto(`/w/${organization.id}`);
    await page.waitForURL(`/w/${organization.id}`, { timeout: 5000 });

    // Create an API key directly in the database
    const { createHash } = await import("crypto");
    const { createId } = await import("@lydie/core/id");
    const { Resource } = await import("sst");

    const stage = Resource.App.stage;
    const prefix = stage === "production" ? "lydie_live_" : "lydie_test_";
    const key = `${prefix}${createId()}`;
    const partialKey = `${key.slice(0, 8)}...${key.slice(-4)}`;
    const hashedKey = createHash("sha256").update(key).digest("hex");

    const [createdKey] = await db
      .insert(apiKeysTable)
      .values({
        name: `Usage Test Key ${Date.now()}`,
        partialKey,
        hashedKey,
        organizationId: organization.id,
        revoked: false,
        lastUsedAt: null,
      })
      .returning();

    try {
      const pageURL = new URL(page.url());
      const baseURL = `${pageURL.protocol}//${pageURL.host}`;
      const apiURL =
        process.env.VITE_API_URL || baseURL.replace(":3000", ":3001");

      // Make a request with the API key
      const response = await page.request.get(
        `${apiURL}/v1/${organization.id}/documents`,
        {
          headers: {
            Authorization: `Bearer ${key}`,
          },
        }
      );

      expect(response.status()).toBe(200);

      // Verify lastUsedAt was updated
      const [updatedKey] = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.id, createdKey.id))
        .limit(1);

      expect(updatedKey?.lastUsedAt).not.toBeNull();
      expect(updatedKey?.lastUsedAt).toBeInstanceOf(Date);
    } finally {
      // Cleanup
      await db
        .delete(apiKeysTable)
        .where(eq(apiKeysTable.id, createdKey.id));
    }
  });
});
