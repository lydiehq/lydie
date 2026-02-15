import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth.fixture";

test.describe("document tabs", () => {
  let tabList: ReturnType<Page["getByRole"]>;

  test.beforeEach(async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    tabList = page.getByRole("tablist", { name: "Open documents" });
  });

  test("opens tab when navigating to a document", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "Hello world",
    });

    // Tab should appear in the tab bar
    await expect(tabList.getByRole("tab", { name: "Test Document" })).toBeVisible();
  });

  test("opens multiple tabs for different documents", async ({ page, organization }) => {
    // Create first document
    await createDocument(page, organization.slug, {
      title: "First Document",
      content: "First content",
    });

    // Create second document
    await createDocument(page, organization.slug, {
      title: "Second Document",
      content: "Second content",
    });

    // Both tabs should be visible
    await expect(tabList.getByRole("tab", { name: "First Document" })).toBeVisible();
    await expect(tabList.getByRole("tab", { name: "Second Document" })).toBeVisible();
  });

  test("clicking a tab navigates to that document", async ({ page, organization }) => {
    // Create two documents
    await createDocument(page, organization.slug, {
      title: "Document A",
      content: "Content A",
    });

    await createDocument(page, organization.slug, {
      title: "Document B",
      content: "Content B",
    });

    // Click on first tab
    await tabList.getByRole("tab", { name: "Document A" }).click();

    // Wait for navigation
    await page.waitForURL(/\/w\/.*\/.*/);

    // First tab should be selected
    const firstTab = tabList.getByRole("tab", { name: "Document A" });
    await expect(firstTab).toHaveAttribute("data-selected", "true");
  });

  test("closing a tab navigates to another tab", async ({ page, organization }) => {
    // Create two documents
    await createDocument(page, organization.slug, {
      title: "Tab to Close",
      content: "Content to close",
    });

    await createDocument(page, organization.slug, {
      title: "Remaining Tab",
      content: "Remaining content",
    });

    // Close the first tab using the close button
    const firstTab = tabList.getByRole("tab", { name: "Tab to Close" });
    await firstTab.getByLabel(/^Close/).click();

    // Should navigate to remaining tab or workspace home
    await page.waitForURL(/\/w\/.*/);

    // Remaining tab should still be visible
    await expect(tabList.getByRole("tab", { name: "Remaining Tab" })).toBeVisible();
    // Closed tab should not be visible
    await expect(tabList.getByRole("tab", { name: "Tab to Close" })).not.toBeVisible();
  });

  test("active tab is visually highlighted", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Active Tab Test",
      content: "Some content",
    });

    // Active tab should have data-selected attribute
    const activeTab = tabList.getByRole("tab", { name: "Active Tab Test" });
    await expect(activeTab).toHaveAttribute("data-selected", "true");
  });

  test("tab shows document title from sidebar navigation", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Sidebar Navigation Test",
      content: "Test content",
    });

    // Click on the document in sidebar to navigate to it
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    await sidebarTree.getByRole("row", { name: "Sidebar Navigation Test" }).click();

    // Tab should show the document title
    await expect(tabList.getByRole("tab", { name: "Sidebar Navigation Test" })).toBeVisible();
  });

  test("updating document title updates tab title", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Original Title",
      content: "Some content",
    });

    // Update the document title
    const titleEditor = page
      .getByLabel("Document title")
      .locator('[contenteditable="true"]')
      .first();
    await titleEditor.click();
    await titleEditor.fill("Updated Title");
    await titleEditor.blur();

    // Wait for auto-save
    await page.waitForTimeout(1000);

    // Tab should reflect the updated title
    await expect(tabList.getByRole("tab", { name: "Updated Title" })).toBeVisible();
    await expect(tabList.getByRole("tab", { name: "Original Title" })).not.toBeVisible();
  });
});

async function createDocument(
  page: Page,
  _organizationSlug: string,
  options: { title: string; content: string },
) {
  await page.getByRole("button", { name: "Create new document" }).click();

  const titleEditor = page.getByLabel("Document title").locator('[contenteditable="true"]').first();
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
