import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth.fixture";

test.describe("link popover", () => {
  test("selecting text and clicking link button opens popover in edit mode", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - Button",
      content: "This is some text to link",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Select text "some text"
    await contentEditor.focus();
    await page.keyboard.press("Control+a"); // Select all
    await page.keyboard.press("ArrowRight"); // Deselect
    await page.keyboard.press("Control+Shift+ArrowRight"); // Select first word
    await page.keyboard.press("Shift+ArrowRight"); // Extend selection
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight"); // Should have "This is" selected

    // Click link button
    const linkButton = page.getByRole("button", { name: "Add Link" });
    await linkButton.click();
    await page.waitForTimeout(300);

    // Verify popover is open in edit mode (has text and link inputs)
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeVisible();
    await expect(page.getByText("Documents")).toBeVisible();

    // Verify the link input is focused
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await expect(linkInput).toBeFocused();
  });

  test("selecting text and pressing CMD+K opens popover in edit mode", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - CMD+K",
      content: "Select this text",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    await contentEditor.click();

    // Select "this text" by double-clicking "this" and then extending
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor || !editor.firstChild) return;

      const range = document.createRange();
      const selection = window.getSelection();

      // Select "this text" (characters 7-16)
      range.setStart(editor.firstChild, 7);
      range.setEnd(editor.firstChild, 16);

      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await page.waitForTimeout(200);

    // Press CMD+K (use Meta for macOS, Control for others)
    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(300);

    // Verify popover is open in edit mode
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeVisible();

    // Verify the text input has the selected text
    const textInput = page.getByPlaceholder("Enter link text...");
    await expect(textInput).toHaveValue("this text");

    // Verify the link input is focused
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await expect(linkInput).toBeFocused();
  });

  test("moving cursor onto existing link opens popover in view mode", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - View Mode",
      content: "",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Create a link using the editor
    await contentEditor.click();
    await contentEditor.type("Check out ");

    // Insert a link programmatically
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.href = "https://example.com";
      link.textContent = "this link";
      editor.appendChild(link);

      const text = document.createTextNode(" for more info");
      editor.appendChild(text);
    });

    await page.waitForTimeout(500);

    // Click inside the link to position cursor
    const link = contentEditor.locator('a[href="https://example.com"]');
    await link.click();
    await page.waitForTimeout(300);

    // Verify popover is open in view mode (no text input, has action buttons)
    await expect(page.getByPlaceholder("Enter link text...")).not.toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open in new tab" })).toBeVisible();
  });

  test("being on link and clicking CMD+K opens edit mode with full link selected", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - Edit Existing",
      content: "",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Create content with a link
    await contentEditor.click();
    await contentEditor.type("Visit ");

    // Insert a link programmatically
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.href = "https://google.com";
      link.textContent = "Google";
      editor.appendChild(link);

      const text = document.createTextNode(" for search");
      editor.appendChild(text);
    });

    await page.waitForTimeout(500);

    // Click inside the link to position cursor
    const link = contentEditor.locator('a[href="https://google.com"]');
    await link.click();
    await page.waitForTimeout(300);

    // Verify view mode is initially open
    await expect(page.getByText("google.com")).toBeVisible();

    // Press CMD+K
    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(300);

    // Verify popover switched to edit mode
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeVisible();

    // Verify the text input has the link text and is focused
    const textInput = page.getByPlaceholder("Enter link text...");
    await expect(textInput).toHaveValue("Google");
    await expect(textInput).toBeFocused();

    // Verify the link input has the URL
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await expect(linkInput).toHaveValue("https://google.com");

    // Verify the link text is selected in the editor
    const selectedText = await page.evaluate(() => {
      const selection = window.getSelection();
      return selection?.toString();
    });
    expect(selectedText).toBe("Google");
  });

  test("being on link and clicking link button opens edit mode with full link selected", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - Edit via Button",
      content: "",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Create content with a link
    await contentEditor.click();
    await contentEditor.fill("Check ");

    // Insert a link programmatically
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.href = "https://github.com";
      link.textContent = "GitHub";
      editor.appendChild(link);

      const text = document.createTextNode(" repo");
      editor.appendChild(text);
    });

    await page.waitForTimeout(500);

    // Click inside the link to position cursor
    const link = contentEditor.locator('a[href="https://github.com"]');
    await link.click();
    await page.waitForTimeout(300);

    // Verify view mode is initially open
    await expect(page.getByText("github.com")).toBeVisible();

    // Click link button in toolbar
    const linkButton = page.getByRole("button", { name: "Add Link" });
    await linkButton.click();
    await page.waitForTimeout(300);

    // Verify popover switched to edit mode
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();
    await expect(page.getByPlaceholder("Search or paste a link")).toBeVisible();

    // Verify the text input has the link text and is focused
    const textInput = page.getByPlaceholder("Enter link text...");
    await expect(textInput).toHaveValue("GitHub");
    await expect(textInput).toBeFocused();

    // Verify the link input has the URL
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await expect(linkInput).toHaveValue("https://github.com");

    // Verify the link text is selected in the editor
    const selectedText = await page.evaluate(() => {
      const selection = window.getSelection();
      return selection?.toString();
    });
    expect(selectedText).toBe("GitHub");
  });

  test("can edit existing link and save changes", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - Edit and Save",
      content: "",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Create content with a link
    await contentEditor.click();
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[aria-label="Document content"] [contenteditable="true"]',
      );
      if (!editor) return;

      const link = document.createElement("a");
      link.href = "https://old-link.com";
      link.textContent = "Old Link";
      editor.appendChild(link);
    });

    await page.waitForTimeout(500);

    // Click link and press CMD+K to enter edit mode
    const link = contentEditor.locator('a[href="https://old-link.com"]');
    await link.click();
    await page.waitForTimeout(300);

    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(300);

    // Edit the link text
    const textInput = page.getByPlaceholder("Enter link text...");
    await textInput.fill("New Link Text");

    // Edit the URL
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill("https://new-link.com");

    // Press Enter to save
    await linkInput.press("Enter");
    await page.waitForTimeout(500);

    // Verify link was updated
    const updatedLink = contentEditor.locator('a[href="https://new-link.com"]');
    await expect(updatedLink).toBeVisible();
    await expect(updatedLink).toHaveText("New Link Text");
  });

  test("can remove link from view mode", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - Remove Link",
      content: "",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Create content with a link
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

    await page.waitForTimeout(500);

    // Click inside the link to open view mode
    const link = contentEditor.locator('a[href="https://remove-me.com"]');
    await link.click();
    await page.waitForTimeout(300);

    // Verify view mode is open
    await expect(page.getByRole("button", { name: "Remove link" })).toBeVisible();

    // Click remove button
    await page.getByRole("button", { name: "Remove link" }).click();
    await page.waitForTimeout(300);

    // Verify link is removed but text remains
    await expect(contentEditor.locator('a[href="https://remove-me.com"]')).not.toBeVisible();
    await expect(contentEditor).toContainText("Remove This Link");
  });

  test("can create internal document link", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    // Create a target document first
    await page.getByRole("button", { name: "Create new document" }).click();
    const titleEditor = page
      .getByLabel("Document title")
      .locator('[contenteditable="true"]')
      .first();
    await titleEditor.click();
    await titleEditor.fill("Target Document");
    await titleEditor.blur();
    await page.waitForTimeout(1000);

    // Create a second document with a link
    await createDocument(page, organization.slug, {
      title: "Link Test - Internal Link",
      content: "Link to document",
    });

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

    await page.waitForTimeout(200);

    // Open link popover
    const isMac = process.platform === "darwin";
    const modifier = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(300);

    // Type to search for target document
    const linkInput = page.getByPlaceholder("Search or paste a link");
    await linkInput.fill("Target");
    await page.waitForTimeout(500);

    // Click on the document in the search results
    const docMenuItem = page.getByRole("menuitem", { name: /Target Document/ });
    await expect(docMenuItem).toBeVisible();
    await docMenuItem.click();
    await page.waitForTimeout(500);

    // Verify internal link was created (href should start with "internal://")
    const internalLink = contentEditor.locator('a[href^="internal://"]');
    await expect(internalLink).toBeVisible();
    await expect(internalLink).toHaveText("document");
  });

  test("popover closes when clicking outside", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - Close Outside",
      content: "Some text here",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Select text and open link popover
    await contentEditor.dblclick();
    await page.waitForTimeout(200);

    const linkButton = page.getByRole("button", { name: "Add Link" });
    await linkButton.click();
    await page.waitForTimeout(300);

    // Verify popover is open
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();

    // Click outside the popover
    await page.click("body", { position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    // Verify popover is closed
    await expect(page.getByPlaceholder("Enter link text...")).not.toBeVisible();
  });

  test("popover closes when pressing escape", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });
    await createDocument(page, organization.slug, {
      title: "Link Test - Close Escape",
      content: "Some text here",
    });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Select text and open link popover
    await contentEditor.dblclick();
    await page.waitForTimeout(200);

    const linkButton = page.getByRole("button", { name: "Add Link" });
    await linkButton.click();
    await page.waitForTimeout(300);

    // Verify popover is open
    await expect(page.getByPlaceholder("Enter link text...")).toBeVisible();

    // Press escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Verify popover is closed
    await expect(page.getByPlaceholder("Enter link text...")).not.toBeVisible();
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
