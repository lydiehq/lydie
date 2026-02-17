import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";

test.describe("internal link integrity", () => {
  test("can create internal link to another document", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    // Create target document
    await createDocument(page, {
      title: "Target Document",
      content: "Target content",
    });

    // Create source document with link
    await createDocument(page, { title: "Source Document", content: "Link here" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Select text and create link
    await selectTextInEditor(page, contentEditor, 0, 8);

    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(200);

    // Search for target document
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill("Target");
    await page.waitForTimeout(300);

    // Select from autocomplete
    const docMenuItem = page.getByRole("menuitem", { name: /Target Document/ });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Verify link with correct format (kind="internal", refId, href)
    const internalLink = contentEditor.locator('a[data-kind="internal"]');
    await expect(internalLink).toBeVisible();
    await expect(internalLink).toHaveAttribute("data-ref-id");
    await expect(internalLink).toHaveText("Link here");
  });

  test("shows backlinks in document metadata", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    // Create target document
    await createDocument(page, {
      title: "Backlink Target",
      content: "Target content",
    });

    // Create document that links to it
    await createDocument(page, { title: "Linking Document", content: "" });

    // Add internal link via editor API
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.setAttribute("data-kind", "internal");
      link.setAttribute("data-ref-id", "target-doc-id");
      link.setAttribute("href", "/backlink-target");
      link.textContent = "Link to target";
      editor.appendChild(link);
    });
    await page.waitForTimeout(300);

    // Reload to trigger indexing
    await page.reload();
    await page.waitForTimeout(1000);

    // Navigate to target and check links panel
    await gotoDocument(page, "Backlink Target");
    await page.waitForTimeout(500);

    // Open documents tab
    const documentsTab = page.getByRole("tab", { name: /documents/i });
    await documentsTab.click();
    await page.waitForTimeout(200);

    // Verify backlink shown
    await expect(page.getByText("Links to this page")).toBeVisible();
    await expect(page.getByText("Linking Document")).toBeVisible();
  });

  test("shows outgoing links in document metadata", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    // Create target document
    await createDocument(page, {
      title: "Outgoing Target",
      content: "Target content",
    });

    // Create source with link
    await createDocument(page, { title: "Source With Link", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Add internal link
    await contentEditor.click();
    await page.keyboard.type("Check this link");
    await selectTextInEditor(page, contentEditor, 5, 9);

    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(200);

    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill("Outgoing");
    await page.waitForTimeout(300);

    const docMenuItem = page.getByRole("menuitem", { name: /Outgoing Target/ });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Reload to trigger indexing
    await page.reload();
    await page.waitForTimeout(1000);

    // Open documents tab
    const documentsTab = page.getByRole("tab", { name: /documents/i });
    await documentsTab.click();
    await page.waitForTimeout(200);

    // Verify outgoing link shown
    await expect(page.getByText("Links from this page")).toBeVisible();
    await expect(page.getByText("Outgoing Target")).toBeVisible();
  });

  test("link count badge updates correctly", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    // Create target document
    await createDocument(page, {
      title: "Badge Test Target",
      content: "Target content",
    });

    // Create source document
    await createDocument(page, { title: "Badge Test Source", content: "Link text" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Add link
    await selectTextInEditor(page, contentEditor, 0, 9);

    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(200);

    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill("Badge");
    await page.waitForTimeout(300);

    const docMenuItem = page.getByRole("menuitem", { name: /Badge Test Target/ });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Reload to trigger indexing
    await page.reload();
    await page.waitForTimeout(1000);

    // Check badge shows "1"
    const documentsTab = page.getByRole("tab", { name: /documents.*1/i });
    await expect(documentsTab).toBeVisible();
  });
});

async function selectTextInEditor(
  page: Page,
  editor: ReturnType<Page["locator"]>,
  start: number,
  end: number,
): Promise<void> {
  await editor.evaluate(
    (el, { start, end }) => {
      const range = document.createRange();
      const selection = window.getSelection();

      if (el.firstChild) {
        range.setStart(el.firstChild, Math.min(start, el.textContent?.length || 0));
        range.setEnd(el.firstChild, Math.min(end, el.textContent?.length || 0));
      }

      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    { start, end },
  );
  await page.waitForTimeout(100);
}

async function gotoDocument(page: Page, title: string): Promise<void> {
  const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
  const documentItem = sidebarTree.getByRole("row", { name: title });
  await documentItem.click();
  await page.waitForTimeout(300);
}
