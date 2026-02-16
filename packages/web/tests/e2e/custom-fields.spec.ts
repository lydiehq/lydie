import { db, documentsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";

test.describe("custom fields", () => {
  test("can add and update string and number fields", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Test Document", content: "" });

    // Add a string field
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    const fieldValueInput = page.getByPlaceholder("Value").first();

    await fieldNameInput.fill("Status");
    await fieldValueInput.fill("Active");
    await fieldValueInput.blur();

    // Add a number field
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInputs = page.getByPlaceholder("Field name");
    const fieldValueInputs = page.getByPlaceholder("Value");
    const typeSelects = page.locator("select");

    await fieldNameInputs.last().fill("Priority");
    await typeSelects.last().selectOption("number");
    await fieldValueInputs.last().fill("5");
    await fieldValueInputs.last().blur();

    await page.waitForTimeout(500);

    // Verify both fields are visible
    await expect(fieldNameInputs.first()).toHaveValue("Status");
    await expect(fieldValueInputs.first()).toHaveValue("Active");
    await expect(fieldNameInputs.last()).toHaveValue("Priority");
    await expect(fieldValueInputs.last()).toHaveValue("5");

    // Update the first field
    await fieldValueInputs.first().fill("Inactive");
    await fieldValueInputs.first().blur();
    await page.waitForTimeout(500);
    await expect(fieldValueInputs.first()).toHaveValue("Inactive");
  });

  test("can change field type and remove fields", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Test Document", content: "" });

    // Add a string field
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    const fieldValueInput = page.getByPlaceholder("Value").first();
    const typeSelect = page.locator("select").first();

    await fieldNameInput.fill("Count");
    await fieldValueInput.fill("10");
    await fieldValueInput.blur();
    await page.waitForTimeout(500);

    // Change type to number
    await typeSelect.selectOption("number");
    await page.waitForTimeout(500);

    await expect(fieldValueInput).toHaveValue("10");
    await expect(fieldValueInput).toHaveAttribute("type", "number");

    // Remove the field
    await page.getByRole("button", { name: "Remove field" }).first().click();
    await page.waitForTimeout(500);
    await expect(fieldNameInput).not.toBeVisible();
  });

  test("filters out empty fields and persists to database", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Test Document", content: "" });

    // Get document ID
    const url = page.url();
    const urlParts = url.split("/").filter(Boolean);
    const documentId = urlParts[urlParts.length - 1] || "";
    expect(documentId).toBeTruthy();

    // Add a field with valid data
    await page.getByRole("button", { name: "+ Add field" }).click();
    let fieldNameInput = page.getByPlaceholder("Field name").first();
    let fieldValueInput = page.getByPlaceholder("Value").first();

    await fieldNameInput.fill("Status");
    await fieldValueInput.fill("Active");
    await fieldValueInput.blur();

    // Add another field but leave it empty
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInputs = page.getByPlaceholder("Field name");
    const fieldValueInputs = page.getByPlaceholder("Value");
    const typeSelects = page.locator("select");

    await fieldNameInputs.last().fill("Priority");
    await typeSelects.last().selectOption("number");
    await fieldValueInputs.last().fill("5");
    await fieldValueInputs.last().blur();
    await page.waitForTimeout(500);

    // Query database to verify custom fields are saved
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);

    expect(document).toBeDefined();
    expect(document.customFields).toBeDefined();
    expect(document.customFields).toHaveProperty("Status", "Active");
    expect(document.customFields).toHaveProperty("Priority", 5);

    // Clear the first field's value
    await fieldValueInputs.first().fill("");
    await fieldValueInputs.first().blur();
    await page.waitForTimeout(500);

    // Reload and verify empty fields are filtered out
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    const reloadedNameInputs = page.getByPlaceholder("Field name");
    const count = await reloadedNameInputs.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const input = reloadedNameInputs.nth(i);
        const value = await input.inputValue();
        expect(value).not.toBe("Status");
      }
    }
  });
});
