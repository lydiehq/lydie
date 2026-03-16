import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";
import { createTestCollection, deleteTestCollection } from "./utils/db";

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
    await expect
      .poll(async () => {
        const tabTexts = await tabList.locator('[role="row"]').allTextContents();
        return tabTexts.join(" ");
      })
      .toContain("First Document");
    await expect
      .poll(async () => {
        const tabTexts = await tabList.locator('[role="row"]').allTextContents();
        return tabTexts.join(" ");
      })
      .toContain("Second Document");
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

    // Single click opens tab
    await sidebarTree.getByRole("row", { name: "Preview Test" }).click();
    const previewTab = getTab("Preview Test");
    await expect(previewTab).toBeVisible();
    await expect(previewTab).toHaveClass(/italic/);

    // Close and test double-click on sidebar
    await previewTab.getByLabel(/^Close/).click();
    await expect(previewTab).not.toBeVisible();

    // Double click on sidebar keeps tab open
    await sidebarTree.getByRole("row", { name: "Preview Test" }).dblclick();
    const hardTab = getTab("Preview Test");
    await expect(hardTab).toBeVisible();
    await expect(hardTab).not.toHaveClass(/italic/);

    // Close and test cmd+click
    await hardTab.getByLabel(/^Close/).click();
    await expect(hardTab).not.toBeVisible();

    // Cmd/Ctrl+click on sidebar keeps tab open
    const row = sidebarTree.getByRole("row", { name: "Preview Test" });
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await row.click({ modifiers: [modifier] });
    const cmdClickTab = getTab("Preview Test");
    await expect(cmdClickTab).toBeVisible();
    await expect(cmdClickTab).not.toHaveClass(/italic/);
  });

  test("supports collection preview/persistent tabs and removes tab on delete", async ({
    page,
    organization,
  }) => {
    const tabList = page.getByRole("grid", { name: "Open documents" });
    const collectionsList = page.getByRole("grid", { name: "Collections" });
    const collectionName = `Tab Collection ${Date.now()}`;
    const collection = await createTestCollection(organization.id, {
      name: collectionName,
      handle: `tab-collection-${Date.now()}`,
    });

    const getTab = (title: string) => tabList.locator('[role="row"]', { hasText: title });
    const getCollectionRow = () => collectionsList.getByRole("row", { name: collectionName });

    try {
      await gotoWorkspace(page, organization.slug);
      await expect(getCollectionRow()).toBeVisible();

      // Single click opens collection as preview tab.
      await getCollectionRow().click();
      const previewTab = getTab(collectionName);
      await expect(previewTab).toBeVisible();
      await expect(previewTab).toHaveClass(/italic/);

      // Double-click makes the collection tab persistent.
      await getCollectionRow().dblclick();
      const persistentTab = getTab(collectionName);
      await expect(persistentTab).toBeVisible();
      await expect(persistentTab).not.toHaveClass(/italic/);

      // Delete collection and verify its tab is removed.
      await page.getByRole("button", { name: "Collection options" }).first().click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Confirm" }).click();

      await expect(page).toHaveURL(`/w/${organization.slug}`);
      await expect(getTab(collectionName)).not.toBeVisible();
    } finally {
      await deleteTestCollection(collection.id);
    }
  });

  test("preview tab is replaced when opening another document", async ({ page, organization }) => {
    const tabList = page.getByRole("grid", { name: "Open documents" });
    const getTab = (title: string) => tabList.locator('[role="row"]', { hasText: title });

    await gotoWorkspace(page, organization.slug);

    await createDocument(page, { title: "First Preview Doc", content: "First content" });
    await createDocument(page, { title: "Second Preview Doc", content: "Second content" });

    // Navigate back to workspace
    await gotoWorkspace(page, organization.slug);

    // Close any existing tabs before testing preview replacement behavior
    while ((await tabList.getByLabel(/^Close/).count()) > 0) {
      await tabList.getByLabel(/^Close/).first().click();
    }

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
    const suffix = Date.now();
    const persistentDoc1 = `Persistent Doc 1 ${suffix}`;
    const persistentDoc2 = `Persistent Doc 2 ${suffix}`;
    const previewDoc = `Preview Doc ${suffix}`;

    await gotoWorkspace(page, organization.slug);

    await createDocument(page, { title: persistentDoc1, content: "Persistent content 1" });
    await createDocument(page, { title: persistentDoc2, content: "Persistent content 2" });
    await createDocument(page, { title: previewDoc, content: "Preview content" });

    // Navigate back to workspace
    await gotoWorkspace(page, organization.slug);

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });

    // Single click opens as preview
    await sidebarTree.getByRole("row", { name: previewDoc, exact: true }).click();
    await expect(getTab(previewDoc)).toBeVisible();

    // Get all tabs and verify order
    const allTabs = tabList.locator('[role="row"]');
    const tabTexts = await allTabs.allTextContents();
    const previewIndex = tabTexts.findIndex((text) => text.includes(previewDoc));
    const persistent1Index = tabTexts.findIndex((text) => text.includes(persistentDoc1));
    const persistent2Index = tabTexts.findIndex((text) => text.includes(persistentDoc2));
    expect(previewIndex).toBeGreaterThan(-1);
    expect(persistent1Index).toBeGreaterThan(-1);
    expect(persistent2Index).toBeGreaterThan(-1);
    expect(previewIndex).toBe(tabTexts.length - 1);
  });
});
