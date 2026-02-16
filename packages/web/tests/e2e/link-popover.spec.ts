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
    await contentEditor.focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Control+Shift+ArrowRight");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+ArrowRight");
    }

    await page.getByRole("button", { name: "Add Link" }).click();
    await page.waitForTimeout(200);

    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeVisible();
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeFocused();

    // Close popover
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.getByPlaceholder("Enter link text...")).not.toBeVisible();

    // Test opening via CMD+K
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor || !editor.firstChild) return;

      const range = document.createRange();
      const selection = window.getSelection();

      range.setStart(editor.firstChild, 7);
      range.setEnd(editor.firstChild, 16);

      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.waitForTimeout(100);

    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
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
    await contentEditor.click();
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.href = "https://example.com";
      link.textContent = "test link";
      editor.appendChild(link);
    });
    await page.waitForTimeout(300);

    // Click inside the link to open view mode
    const link = contentEditor.locator('a[href="https://example.com"]');
    await link.click();
    await page.waitForTimeout(200);

    // Verify view mode
    await expect(page.getByPlaceholder("Enter link text...")).not.toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove link" })).toBeVisible();

    // Switch to edit mode via CMD+K
    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(200);

    // Verify edit mode
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toHaveValue(
      "https://example.com",
    );
    await expect(page.getByPlaceholder("Enter link text...")).toBeFocused();

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
    await contentEditor.click();
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.href = "https://remove-me.com";
      link.textContent = "Remove This Link";
      editor.appendChild(link);
    });
    await page.waitForTimeout(300);

    // Open view mode
    const link = contentEditor.locator('a[href="https://remove-me.com"]');
    await link.click();
    await page.waitForTimeout(200);

    // Remove link
    await page.getByRole("button", { name: "Remove link" }).click();
    await page.waitForTimeout(200);

    // Verify link is removed but text remains
    await expect(contentEditor.locator('a[href="https://remove-me.com"]')).not.toBeVisible();
    await expect(contentEditor).toContainText("Remove This Link");

    // Create another link to test closing via click outside
    await contentEditor.click();
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.href = "https://example.com";
      link.textContent = "link text";
      editor.appendChild(link);
    });
    await page.waitForTimeout(300);

    await contentEditor.locator('a[href="https://example.com"]').click();
    await page.waitForTimeout(200);

    await expect(page.getByText("example.com")).toBeVisible();

    // Close via click outside
    await page.click("body", { position: { x: 10, y: 10 } });
    await page.waitForTimeout(200);
    await expect(page.getByText("example.com")).not.toBeVisible();
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
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor || !editor.firstChild) return;

      const range = document.createRange();
      const selection = window.getSelection();

      range.setStart(editor.firstChild, 8);
      range.setEnd(editor.firstChild, 16);

      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.waitForTimeout(100);

    // Open link popover
    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
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
    const internalLink = contentEditor.locator('a[href^="internal://"]');
    await expect(internalLink).toBeVisible();
    await expect(internalLink).toHaveText("document");
  });
});
