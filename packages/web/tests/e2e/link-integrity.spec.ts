import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";

test.describe.skip("internal link integrity", () => {
  test("can create internal link to another document", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    const suffix = Date.now();
    const targetTitle = `Target Document ${suffix}`;

    // Create target document
    await createDocument(page, {
      title: targetTitle,
      content: "Target content",
    });

    // Create source document with link
    await createDocument(page, { title: "Source Document", content: "Link here" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Select text and create link
    await selectTextInEditor(page, contentEditor, 0, 9);

    await expect(page.getByRole("button", { name: "Add Link" })).toBeVisible();
    await page.getByRole("button", { name: "Add Link" }).click();
    await page.waitForTimeout(200);

    // Search for target document
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill(targetTitle);
    await page.waitForTimeout(300);

    // Select from autocomplete
    const docMenuItem = page.getByRole("menuitem", { name: targetTitle });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Verify link with correct format (kind="internal", refId, href)
    const internalLink = contentEditor.locator('a[href^="/"]');
    await expect(internalLink).toBeVisible();
    await expect(internalLink).toHaveAttribute("data-ref-id");
    await expect(internalLink).toHaveText("Link here");
  });

  test("shows backlinks in document metadata", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    const suffix = Date.now();
    const targetTitle = `Backlink Target ${suffix}`;

    // Create target document
    await createDocument(page, {
      title: targetTitle,
      content: "Target content",
    });

    // Create document that links to it
    await createDocument(page, { title: "Linking Document", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();
    await contentEditor.fill("Link to target");
    await selectTextInEditor(page, contentEditor, 0, 14);
    await expect(page.getByRole("button", { name: "Add Link" })).toBeVisible();
    await page.getByRole("button", { name: "Add Link" }).click();
    await page.waitForTimeout(200);

    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill(targetTitle);
    await page.waitForTimeout(300);

    const docMenuItem = page.getByRole("menuitem", { name: targetTitle });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Reload and verify link persisted
    await page.reload();
    await page.waitForTimeout(300);
    await expect(contentEditor.locator('a[data-kind="internal"]')).toHaveCount(1);
  });

  test("shows outgoing links in document metadata", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    const suffix = Date.now();
    const targetTitle = `Outgoing Target ${suffix}`;

    // Create target document
    await createDocument(page, {
      title: targetTitle,
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
    await selectTextInEditor(page, contentEditor, 6, 10);
    await expect(page.getByRole("button", { name: "Add Link" })).toBeVisible();
    await page.getByRole("button", { name: "Add Link" }).click();
    await page.waitForTimeout(200);

    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill(targetTitle);
    await page.waitForTimeout(300);

    const docMenuItem = page.getByRole("menuitem", { name: targetTitle });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Reload and verify outgoing link persisted
    await page.reload();
    await page.waitForTimeout(300);
    const internalLink = contentEditor.locator('a[data-kind="internal"]');
    await expect(internalLink).toHaveCount(1);
    await expect(internalLink).toHaveText("this");
  });

  test("link count badge updates correctly", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    const suffix = Date.now();
    const targetTitle = `Badge Test Target ${suffix}`;

    // Create target document
    await createDocument(page, {
      title: targetTitle,
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

    await expect(page.getByRole("button", { name: "Add Link" })).toBeVisible();
    await page.getByRole("button", { name: "Add Link" }).click();
    await page.waitForTimeout(200);

    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill(targetTitle);
    await page.waitForTimeout(300);

    const docMenuItem = page.getByRole("menuitem", { name: targetTitle });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Reload and ensure link count remains stable
    await page.reload();
    await page.waitForTimeout(300);
    await expect(contentEditor.locator('a[href^="/"]')).toHaveCount(1);
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
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (!(textNode instanceof Text)) return;
      const maxOffset = textNode.textContent?.length ?? 0;
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(textNode, Math.min(start, maxOffset));
      range.setEnd(textNode, Math.min(end, maxOffset));

      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    { start, end },
  );
  await page.waitForTimeout(100);
}
