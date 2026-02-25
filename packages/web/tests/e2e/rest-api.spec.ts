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
    await page.getByRole("textbox", { name: /e\.g\., Production API, Development Key/i }).fill(apiKeyName);

    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Create API Key/i })
      .click();

    await expect(page.getByText(/API Key Created Successfully/i)).toBeVisible();
    await expect(page.getByText(/lydie_test_|lydie_live_/i)).toBeVisible();

    // Close the dialog
    await page.getByRole("button", { name: /Done/i }).click();

    // Verify created key appears in the management list
    await expect(page.getByText(apiKeyName)).toBeVisible();

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
