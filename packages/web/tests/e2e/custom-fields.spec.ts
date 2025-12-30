import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth.fixture";
import { db, documentsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

test.describe("custom fields", () => {
  test("can add a string custom field", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Add a new custom field
    await page.getByRole("button", { name: "+ Add field" }).click();

    // Fill in the field name
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    await fieldNameInput.fill("Status");
    await fieldNameInput.blur();

    // Fill in the field value
    const fieldValueInput = page.getByPlaceholder("Value").first();
    await fieldValueInput.fill("Active");
    await fieldValueInput.blur();

    // Wait for debounced save (500ms + some buffer)
    await page.waitForTimeout(1000);

    // Verify the field is visible in the UI
    await expect(fieldNameInput).toHaveValue("Status");
    await expect(fieldValueInput).toHaveValue("Active");

    // Reload and verify persistence
    await page.reload({ waitUntil: "networkidle" });
    const reloadedFieldNameInput = page.getByPlaceholder("Field name").first();
    const reloadedFieldValueInput = page.getByPlaceholder("Value").first();
    await expect(reloadedFieldNameInput).toHaveValue("Status");
    await expect(reloadedFieldValueInput).toHaveValue("Active");
  });

  test("can add a number custom field", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Add a new custom field
    await page.getByRole("button", { name: "+ Add field" }).click();

    // Fill in the field name
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    await fieldNameInput.fill("Priority");
    await fieldNameInput.blur();

    // Change type to number
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("number");

    // Fill in the field value
    const fieldValueInput = page.getByPlaceholder("Value").first();
    await fieldValueInput.fill("5");
    await fieldValueInput.blur();

    // Wait for debounced save
    await page.waitForTimeout(1000);

    // Verify the field is visible in the UI
    await expect(fieldNameInput).toHaveValue("Priority");
    await expect(fieldValueInput).toHaveValue("5");

    // Reload and verify persistence
    await page.reload({ waitUntil: "networkidle" });
    const reloadedFieldNameInput = page.getByPlaceholder("Field name").first();
    const reloadedFieldValueInput = page.getByPlaceholder("Value").first();
    await expect(reloadedFieldNameInput).toHaveValue("Priority");
    await expect(reloadedFieldValueInput).toHaveValue("5");
  });

  test("can update an existing custom field", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Add a custom field
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    const fieldValueInput = page.getByPlaceholder("Value").first();

    await fieldNameInput.fill("Status");
    await fieldValueInput.fill("Draft");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Update the value
    await fieldValueInput.fill("Published");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Verify the update
    await expect(fieldValueInput).toHaveValue("Published");

    // Reload and verify persistence
    await page.reload({ waitUntil: "networkidle" });
    const reloadedFieldValueInput = page.getByPlaceholder("Value").first();
    await expect(reloadedFieldValueInput).toHaveValue("Published");
  });

  test("can remove a custom field", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Add a custom field
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    const fieldValueInput = page.getByPlaceholder("Value").first();

    await fieldNameInput.fill("Status");
    await fieldValueInput.fill("Active");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Remove the field
    await page.getByRole("button", { name: "Remove field" }).first().click();
    await page.waitForTimeout(1000);

    // Verify the field is removed
    await expect(fieldNameInput).not.toBeVisible();

    // Reload and verify the field is not persisted
    await page.reload({ waitUntil: "networkidle" });
    // After reload, if the field was removed, we should only see the "+ Add field" button
    // and no field inputs with "Status" value
    const fieldNameInputs = page.getByPlaceholder("Field name");
    const count = await fieldNameInputs.count();
    if (count > 0) {
      // If there are any inputs, none should have "Status" as value
      for (let i = 0; i < count; i++) {
        const input = fieldNameInputs.nth(i);
        const value = await input.inputValue();
        expect(value).not.toBe("Status");
      }
    }
  });

  test("can add multiple custom fields", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Add first field
    await page.getByRole("button", { name: "+ Add field" }).click();
    let fieldNameInput = page.getByPlaceholder("Field name").first();
    let fieldValueInput = page.getByPlaceholder("Value").first();
    await fieldNameInput.fill("Status");
    await fieldValueInput.fill("Active");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Add second field
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInputs = page.getByPlaceholder("Field name");
    const fieldValueInputs = page.getByPlaceholder("Value");

    // Fill the second field (last one)
    await fieldNameInputs.last().fill("Priority");
    await fieldValueInputs.last().fill("High");
    await fieldValueInputs.last().blur();
    await page.waitForTimeout(1000);

    // Verify both fields are visible
    await expect(fieldNameInputs.first()).toHaveValue("Status");
    await expect(fieldValueInputs.first()).toHaveValue("Active");
    await expect(fieldNameInputs.last()).toHaveValue("Priority");
    await expect(fieldValueInputs.last()).toHaveValue("High");

    // Reload and verify both fields persist
    await page.reload({ waitUntil: "networkidle" });
    const reloadedNameInputs = page.getByPlaceholder("Field name");
    const reloadedValueInputs = page.getByPlaceholder("Value");

    // Verify we have at least 2 fields
    const nameCount = await reloadedNameInputs.count();
    expect(nameCount).toBeGreaterThanOrEqual(2);

    // Check that both fields are present
    const firstFieldName = await reloadedNameInputs.first().inputValue();
    const lastFieldName = await reloadedNameInputs.last().inputValue();
    const firstFieldValue = await reloadedValueInputs.first().inputValue();
    const lastFieldValue = await reloadedValueInputs.last().inputValue();

    expect(
      (firstFieldName === "Status" && firstFieldValue === "Active") ||
        (lastFieldName === "Status" && lastFieldValue === "Active")
    ).toBe(true);
    expect(
      (firstFieldName === "Priority" && firstFieldValue === "High") ||
        (lastFieldName === "Priority" && lastFieldValue === "High")
    ).toBe(true);
  });

  test("can change field type from string to number", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Add a string field
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    const fieldValueInput = page.getByPlaceholder("Value").first();
    const typeSelect = page.locator("select").first();

    await fieldNameInput.fill("Count");
    await fieldValueInput.fill("10");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Change type to number
    await typeSelect.selectOption("number");
    await page.waitForTimeout(1000);

    // Verify the value is still there and input type changed
    await expect(fieldValueInput).toHaveValue("10");
    await expect(fieldValueInput).toHaveAttribute("type", "number");

    // Reload and verify the field is saved as number
    await page.reload({ waitUntil: "networkidle" });
    const reloadedValueInput = page.getByPlaceholder("Value").first();
    await expect(reloadedValueInput).toHaveValue("10");
    await expect(reloadedValueInput).toHaveAttribute("type", "number");
  });

  test("filters out empty fields", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Add a field with valid data
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInput = page.getByPlaceholder("Field name").first();
    const fieldValueInput = page.getByPlaceholder("Value").first();

    await fieldNameInput.fill("Status");
    await fieldValueInput.fill("Active");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Add another field but leave it empty
    await page.getByRole("button", { name: "+ Add field" }).click();
    await page.waitForTimeout(1000);

    // Clear the first field's value
    await fieldValueInput.fill("");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Reload and verify empty fields are not persisted
    await page.reload({ waitUntil: "networkidle" });

    // The empty field should not be visible (only the new empty row for adding)
    const fieldNameInputs = page.getByPlaceholder("Field name");
    const count = await fieldNameInputs.count();
    // After clearing the field, it should not be persisted
    // We might have empty inputs for adding new fields, but none should have "Status" as value
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const input = fieldNameInputs.nth(i);
        const value = await input.inputValue();
        expect(value).not.toBe("Status");
      }
    }
    // Should have the "+ Add field" button
    const addButton = page.getByRole("button", { name: "+ Add field" });
    await expect(addButton).toBeVisible();
  });

  test("persists custom fields in database", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    });

    // Get the document ID from the URL
    // URL format: /w/{organizationSlug}/{documentId}
    const url = page.url();
    const urlParts = url.split("/").filter(Boolean);
    const documentId = urlParts[urlParts.length - 1] || "";

    expect(documentId).toBeTruthy();

    // Add custom fields
    await page.getByRole("button", { name: "+ Add field" }).click();
    let fieldNameInput = page.getByPlaceholder("Field name").first();
    let fieldValueInput = page.getByPlaceholder("Value").first();

    await fieldNameInput.fill("Status");
    await fieldValueInput.fill("Active");
    await fieldValueInput.blur();
    await page.waitForTimeout(1000);

    // Add second field with number type
    await page.getByRole("button", { name: "+ Add field" }).click();
    const fieldNameInputs = page.getByPlaceholder("Field name");
    const fieldValueInputs = page.getByPlaceholder("Value");
    const typeSelects = page.locator("select");

    await fieldNameInputs.last().fill("Priority");
    await typeSelects.last().selectOption("number");
    await fieldValueInputs.last().fill("5");
    await fieldValueInputs.last().blur();
    await page.waitForTimeout(1000);

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
  });
});

async function createDocument(
  page: Page,
  _organizationSlug: string,
  options: { title: string; content: string }
) {
  await page.getByRole("button", { name: "Create new document" }).click();

  const titleEditor = page
    .getByLabel("Document title")
    .locator('[contenteditable="true"]')
    .first();
  await titleEditor.click();
  await titleEditor.fill(options.title);
  await titleEditor.blur();

  const contentEditor = page
    .getByLabel("Document content")
    .locator('[contenteditable="true"]')
    .first();
  await contentEditor.fill(options.content);

  // Wait for auto-save
  await page.waitForTimeout(1000);
}
