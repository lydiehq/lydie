import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";

test.describe("document tabs", () => {
  test("opens tabs when navigating to documents and supports basic interactions", async ({
    page,
    organization,
  }) => {
    const tabList = page.getByRole("grid", { name: "Open documents" });
    const getTab = (title: string) => tabList.locator('[role="row"]', { hasText: title });

    await gotoWorkspace(page, organization.slug);

    // Create first document
    await createDocument(page, { title: "First Document", content: "First content" });

    const firstTab = getTab("First Document");
    await expect(firstTab).toBeVisible();
    await expect(firstTab).toHaveAttribute("aria-selected", "true");

    // Create second document
    await createDocument(page, { title: "Second Document", content: "Second content" });

    const secondTab = getTab("Second Document");
    await expect(firstTab).toBeVisible();
    await expect(secondTab).toBeVisible();
    await expect(secondTab).toHaveAttribute("aria-selected", "true");

    // Click on first tab to navigate
    await firstTab.click();
    await page.waitForURL(/\/w\/.*\/.*/);
    await expect(firstTab).toHaveAttribute("aria-selected", "true");

    // Close first tab
    await firstTab.getByLabel(/^Close/).click();
    await page.waitForURL(/\/w\/.*/);
    await expect(firstTab).not.toBeVisible();
    await expect(secondTab).toBeVisible();
  });

  test("updates tab title when document title changes", async ({ page, organization }) => {
    const tabList = page.getByRole("grid", { name: "Open documents" });
    const getTab = (title: string) => tabList.locator('[role="row"]', { hasText: title });

    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Original Title", content: "Some content" });

    const titleEditor = page
      .getByLabel("Document title")
      .locator('[contenteditable="true"]')
      .first();
    await titleEditor.click();
    await titleEditor.fill("Updated Title");
    await titleEditor.blur();
    await page.waitForTimeout(500);

    await expect(getTab("Updated Title")).toBeVisible();
    await expect(getTab("Original Title")).not.toBeVisible();
  });

  test("supports preview and hard tab modes", async ({ page, organization }) => {
    const tabList = page.getByRole("grid", { name: "Open documents" });
    const getTab = (title: string) => tabList.locator('[role="row"]', { hasText: title });

    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Preview Test", content: "Test content" });

    // Navigate back to workspace
    await gotoWorkspace(page, organization.slug);

    // Close existing tab
    const existingTab = getTab("Preview Test");
    await existingTab.getByLabel(/^Close/).click();
    await expect(existingTab).not.toBeVisible();

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });

    // Single click opens as preview (italic)
    await sidebarTree.getByRole("row", { name: "Preview Test" }).click();
    const previewTab = getTab("Preview Test");
    await expect(previewTab).toBeVisible();
    await expect(previewTab).toHaveClass(/italic/);

    // Double click converts to hard tab (no italic)
    await previewTab.dblclick();
    await expect(previewTab).not.toHaveClass(/italic/);

    // Close and test double-click on sidebar
    await previewTab.getByLabel(/^Close/).click();
    await expect(previewTab).not.toBeVisible();

    // Double click on sidebar opens as hard tab
    await sidebarTree.getByRole("row", { name: "Preview Test" }).dblclick();
    const hardTab = getTab("Preview Test");
    await expect(hardTab).toBeVisible();
    await expect(hardTab).not.toHaveClass(/italic/);

    // Close and test cmd+click
    await hardTab.getByLabel(/^Close/).click();
    await expect(hardTab).not.toBeVisible();

    // Cmd+click on sidebar opens as hard tab
    const row = sidebarTree.getByRole("row", { name: "Preview Test" });
    await row.click({ modifiers: ["Meta"] });
    const cmdClickTab = getTab("Preview Test");
    await expect(cmdClickTab).toBeVisible();
    await expect(cmdClickTab).not.toHaveClass(/italic/);
  });

  test("preview tab is replaced when opening another document", async ({ page, organization }) => {
    const tabList = page.getByRole("grid", { name: "Open documents" });
    const getTab = (title: string) => tabList.locator('[role="row"]', { hasText: title });

    await gotoWorkspace(page, organization.slug);

    await createDocument(page, { title: "First Preview Doc", content: "First content" });
    await createDocument(page, { title: "Second Preview Doc", content: "Second content" });

    // Navigate back to workspace
    await gotoWorkspace(page, organization.slug);

    // Close existing tabs
    const firstTab = getTab("First Preview Doc");
    await firstTab.getByLabel(/^Close/).click();
    await expect(firstTab).not.toBeVisible();

    const secondTab = getTab("Second Preview Doc");
    await secondTab.getByLabel(/^Close/).click();
    await expect(secondTab).not.toBeVisible();

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });

    // Single click first document (opens as preview)
    await sidebarTree.getByRole("row", { name: "First Preview Doc" }).click();
    await expect(getTab("First Preview Doc")).toBeVisible();

    // Single click second document (should replace preview)
    await sidebarTree.getByRole("row", { name: "Second Preview Doc" }).click();

    await expect(getTab("Second Preview Doc")).toBeVisible();
    await expect(getTab("First Preview Doc")).not.toBeVisible();
  });

  test("preview tabs appear at the end of the tab bar", async ({ page, organization }) => {
    const tabList = page.getByRole("grid", { name: "Open documents" });
    const getTab = (title: string) => tabList.locator('[role="row"]', { hasText: title });

    await gotoWorkspace(page, organization.slug);

    await createDocument(page, { title: "Persistent Doc 1", content: "Persistent content 1" });
    await createDocument(page, { title: "Persistent Doc 2", content: "Persistent content 2" });
    await createDocument(page, { title: "Preview Doc", content: "Preview content" });

    // Navigate back to workspace
    await gotoWorkspace(page, organization.slug);

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });

    // Single click opens as preview
    await sidebarTree.getByRole("row", { name: "Preview Doc" }).click();
    await expect(getTab("Preview Doc")).toBeVisible();

    // Get all tabs and verify order
    const allTabs = tabList.locator('[role="row"]');
    await expect(allTabs).toHaveCount(3);

    const tabTexts = await allTabs.allTextContents();
    expect(tabTexts[0]).toBe("Persistent Doc 1");
    expect(tabTexts[1]).toBe("Persistent Doc 2");
    expect(tabTexts[2]).toBe("Preview Doc");

    const previewTab = getTab("Preview Doc");
    await expect(previewTab).toHaveClass(/italic/);
  });
});
