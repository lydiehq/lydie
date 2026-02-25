import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";

test.describe("link popover", () => {
  test("can open popover in edit mode via button and keyboard", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Link Test", content: "This is some text to link" });
    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Test opening via button
    await selectTextInEditor(page, contentEditor, 13, 17);

    await expect(page.getByRole("button", { name: "Add Link" })).toBeVisible();
    await page.getByRole("button", { name: "Add Link" }).click();
    await page.waitForTimeout(200);

    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeVisible();
    await expect(page.getByTestId("link-popover").getByText("Documents")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeFocused();

    // Close popover
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.getByPlaceholder("Enter link text...")).not.toBeVisible();

    // Test opening via CMD+K
    await selectTextInEditor(page, contentEditor, 5, 16);
    await pressLinkShortcut(page);
    await page.waitForTimeout(200);

    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeVisible();
  });

  test("can view and edit existing links", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Link View Test", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Create a link
    await createExternalLink(page, contentEditor, "test link", "https://example.com");

    // Click inside the link to open view mode
    const link = contentEditor.locator('a[href="https://example.com"]');
    await link.click();
    await page.waitForTimeout(200);

    // Verify view mode
    await expect(page.getByPlaceholder("Enter link text...")).not.toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();
    await expect(page.getByTestId("link-edit-button")).toBeVisible();
    await expect(page.getByTestId("link-remove-button")).toBeVisible();

    // Switch to edit mode via CMD+K
    await pressLinkShortcut(page);
    await page.waitForTimeout(200);

    // Verify edit mode
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();

    // Edit the link
    const textInput = page.getByPlaceholder("Enter link text...");
    await textInput.fill("New Link Text");

    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill("https://new-link.com");
    await linkInput.press("Enter");
    await page.waitForTimeout(300);

    // Verify link was updated
    const updatedLink = contentEditor.locator('a[href="https://new-link.com"]');
    await expect(updatedLink).toBeVisible();
    await expect(updatedLink).toHaveText("New Link Text");
  });

  test("can remove links and close popover", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Link Remove Test", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Create a link
    await createExternalLink(page, contentEditor, "Remove This Link", "https://remove-me.com");

    // Open view mode
    const link = contentEditor.locator('a[href="https://remove-me.com"]');
    await link.click();
    await page.waitForTimeout(200);

    // Remove link
    await page.getByTestId("link-remove-button").click();
    await page.waitForTimeout(200);

    // Verify link is removed but text remains
    await expect(contentEditor.locator('a[href="https://remove-me.com"]')).not.toBeVisible();
    await expect(contentEditor).toContainText("Remove This Link");

    // Create another link to ensure view mode can be reopened
    await createExternalLink(page, contentEditor, "link text", "https://example.com");

    await contentEditor.locator('a[href="https://example.com"]').click();
    await page.waitForTimeout(200);

    await expect(page.getByText("example.com")).toBeVisible();
  });

  test("can create internal document link", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    // Create a target document
    await page.getByRole("button", { name: "Create new document" }).click();
    const titleEditor = page
      .getByLabel("Document title")
      .locator('[contenteditable="true"]')
      .first();
    await titleEditor.click();
    await titleEditor.fill("Target Document");
    await titleEditor.blur();
    await page.waitForTimeout(500);

    // Create a second document with a link
    await createDocument(page, { title: "Link Test - Internal Link", content: "Link to document" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Select "document" text
    await selectTextInEditor(page, contentEditor, 8, 16);

    // Open link popover
    await pressLinkShortcut(page);
    await page.waitForTimeout(200);

    // Type to search for target document
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill("Target");
    await page.waitForTimeout(300);

    // Click on the document in the search results
    const docMenuItem = page.getByRole("menuitem", { name: /Target Document/ });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(300);

    // Verify internal link was created
    const internalLink = contentEditor.locator('a:has-text("document")');
    await expect(internalLink).toBeVisible();
    await expect(internalLink).toHaveText("document");
  });
});

async function pressLinkShortcut(page: Page): Promise<void> {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+k`);
}

async function selectTextInEditor(
  page: Page,
  editor: ReturnType<Page["locator"]>,
  start: number,
  end: number,
): Promise<void> {
  await editor.click();
  await editor.evaluate(
    (el, { start, end }) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (!(textNode instanceof Text)) return;
      const maxOffset = textNode.textContent?.length ?? 0;
      const range = document.createRange();
      range.setStart(textNode, Math.min(start, maxOffset));
      range.setEnd(textNode, Math.min(end, maxOffset));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    { start, end },
  );
  await page.waitForTimeout(100);
}

async function createExternalLink(
  page: Page,
  editor: ReturnType<Page["locator"]>,
  text: string,
  href: string,
): Promise<void> {
  await editor.fill(text);
  await selectTextInEditor(page, editor, 0, text.length);
  await pressLinkShortcut(page);
  const linkInput = page.getByPlaceholder("Search or paste a link");
  await expect(linkInput).toBeVisible();
  await linkInput.fill(href);
  await linkInput.press("Enter");
  await page.waitForTimeout(300);
}
