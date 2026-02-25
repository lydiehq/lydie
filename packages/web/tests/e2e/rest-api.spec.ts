import { apiKeysTable, db } from "@lydie/database";
import { eq } from "drizzle-orm";

import { expect, test } from "./fixtures/auth.fixture";

test.describe("API key REST API", () => {
  test("should authenticate with API key to external API", async ({ page, organization }) => {
    // Navigate to a page first to establish base URL
    await page.goto(`/w/${organization.slug}/settings`);
    await page.waitForURL(`/w/${organization.slug}/settings`);

    // Create an API key through the UI
    await page
      .getByRole("button", { name: /Create API Key/i })
      .first()
      .click();

    await expect(page.getByRole("heading", { name: /Create API Key/i })).toBeVisible();

    const apiKeyName = `Auth Test Key ${Date.now()}`;
    await page.getByLabel(/Name/i).fill(apiKeyName);

    await page
      .getByRole("dialog", { name: /Create API Key/i })
      .getByRole("button", { name: /Create API Key/i })
      .click();

    await expect(page.getByText(/API Key Created Successfully/i)).toBeVisible();

    // Get the full API key value
    const apiKeyValue = await page
      .locator("input[readonly], textarea[readonly]")
      .first()
      .inputValue();

    expect(apiKeyValue).toBeTruthy();
    expect(apiKeyValue.startsWith("lydie_test_") || apiKeyValue.startsWith("lydie_live_")).toBe(
      true,
    );

    // Close the dialog
    await page.getByRole("button", { name: /Close/i }).click();

    // Get the API base URL from the page URL
    const pageURL = new URL(page.url());
    const baseURL = `${pageURL.protocol}//${pageURL.host}`;
    const apiURL = process.env.VITE_API_URL || baseURL.replace(":3000", ":3001");

    // Test the API key by making a request to the external API
    const response = await page.request.get(`${apiURL}/v1/${organization.id}/documents`, {
      headers: {
        Authorization: `Bearer ${apiKeyValue}`,
      },
    });

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
});
