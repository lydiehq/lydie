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

  test("single click opens preview tab (italic style)", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Preview Document",
      content: "Preview content",
    });

    // Navigate back to workspace
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    // Close the existing persistent tab so we can test preview behavior
    const existingTab = tabList.getByRole("tab", { name: "Preview Document" });
    await existingTab.getByLabel(/^Close/).click();
    await expect(existingTab).not.toBeVisible();

    // Single click on document in sidebar
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    await sidebarTree.getByRole("row", { name: "Preview Document" }).click();

    // Tab should appear with italic style (preview mode)
    const previewTab = tabList.getByRole("tab", { name: "Preview Document" });
    await expect(previewTab).toBeVisible();
    await expect(previewTab).toHaveClass(/italic/);
  });

  test("double click on sidebar opens hard tab (non-italic)", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Hard Open Document",
      content: "Hard open content",
    });

    // Navigate back to workspace
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    // Double click on document in sidebar
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    await sidebarTree.getByRole("row", { name: "Hard Open Document" }).dblclick();

    // Tab should appear without italic style (hard open)
    const hardTab = tabList.getByRole("tab", { name: "Hard Open Document" });
    await expect(hardTab).toBeVisible();
    await expect(hardTab).not.toHaveClass(/italic/);
  });

  test("cmd+click on sidebar opens hard tab", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Cmd Click Document",
      content: "Cmd click content",
    });

    // Navigate back to workspace
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    // Cmd+click on document in sidebar
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    const row = sidebarTree.getByRole("row", { name: "Cmd Click Document" });
    await row.click({ modifiers: ["Meta"] });

    // Tab should appear without italic style (hard open)
    const hardTab = tabList.getByRole("tab", { name: "Cmd Click Document" });
    await expect(hardTab).toBeVisible();
    await expect(hardTab).not.toHaveClass(/italic/);
  });

  test("double click on preview tab converts to hard tab", async ({ page, organization }) => {
    // Create a document
    await createDocument(page, organization.slug, {
      title: "Convert to Hard Tab",
      content: "Convert content",
    });

    // Navigate back to workspace
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    // Close the existing persistent tab so we can test preview behavior
    const existingTab = tabList.getByRole("tab", { name: "Convert to Hard Tab" });
    await existingTab.getByLabel(/^Close/).click();
    await expect(existingTab).not.toBeVisible();

    // Single click to open as preview
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    await sidebarTree.getByRole("row", { name: "Convert to Hard Tab" }).click();

    // Verify it's a preview tab (italic)
    const previewTab = tabList.getByRole("tab", { name: "Convert to Hard Tab" });
    await expect(previewTab).toHaveClass(/italic/);

    // Double click the tab to convert to hard tab
    await previewTab.dblclick();

    // Tab should no longer have italic style
    await expect(previewTab).not.toHaveClass(/italic/);
  });

  test("preview tab is replaced when opening another document", async ({ page, organization }) => {
    // Create two documents
    await createDocument(page, organization.slug, {
      title: "First Preview Doc",
      content: "First content",
    });

    await createDocument(page, organization.slug, {
      title: "Second Preview Doc",
      content: "Second content",
    });

    // Navigate back to workspace
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    // Close existing persistent tabs so we can test preview replacement behavior
    const firstTab = tabList.getByRole("tab", { name: "First Preview Doc" });
    await firstTab.getByLabel(/^Close/).click();
    await expect(firstTab).not.toBeVisible();

    const secondTab = tabList.getByRole("tab", { name: "Second Preview Doc" });
    await secondTab.getByLabel(/^Close/).click();
    await expect(secondTab).not.toBeVisible();

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });

    // Single click first document (opens as preview)
    await sidebarTree.getByRole("row", { name: "First Preview Doc" }).click();
    await expect(tabList.getByRole("tab", { name: "First Preview Doc" })).toBeVisible();

    // Single click second document (should replace preview)
    await sidebarTree.getByRole("row", { name: "Second Preview Doc" }).click();

    // Second document should be visible
    await expect(tabList.getByRole("tab", { name: "Second Preview Doc" })).toBeVisible();
    // First document should be replaced (no longer visible)
    await expect(tabList.getByRole("tab", { name: "First Preview Doc" })).not.toBeVisible();
  });

  test("preview tabs always appear at the end of the tab bar", async ({ page, organization }) => {
    // Create two persistent documents
    await createDocument(page, organization.slug, {
      title: "Persistent Doc 1",
      content: "Persistent content 1",
    });

    await createDocument(page, organization.slug, {
      title: "Persistent Doc 2",
      content: "Persistent content 2",
    });

    // Create a third document that will be opened as preview
    await createDocument(page, organization.slug, {
      title: "Preview Doc",
      content: "Preview content",
    });

    // Navigate back to workspace
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });

    // Single click the third document (opens as preview)
    await sidebarTree.getByRole("row", { name: "Preview Doc" }).click();
    await expect(tabList.getByRole("tab", { name: "Preview Doc" })).toBeVisible();

    // Get all tabs and verify order
    const allTabs = tabList.getByRole("tab");
    await expect(allTabs).toHaveCount(3);

    // Preview tab should be the last one
    const tabTexts = await allTabs.allTextContents();
    expect(tabTexts[0]).toBe("Persistent Doc 1");
    expect(tabTexts[1]).toBe("Persistent Doc 2");
    expect(tabTexts[2]).toBe("Preview Doc");

    // Verify preview tab has italic style
    const previewTab = tabList.getByRole("tab", { name: "Preview Doc" });
    await expect(previewTab).toHaveClass(/italic/);
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
