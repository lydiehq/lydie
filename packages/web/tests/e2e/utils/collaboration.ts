import type { BrowserContext, Page } from "@playwright/test";

// Helper to get the content editor for a page
export function getContentEditor(page: Page) {
  return page.getByLabel("Document content").locator('[contenteditable="true"]').first();
}

// Helper to get the title editor for a page
export function getTitleEditor(page: Page) {
  return page.getByLabel("Document title").locator('[contenteditable="true"]').first();
}

// Helper to create a document and return its URL
export async function createDocument(
  page: Page,
  options: { title: string; content: string },
): Promise<string> {
  await page.getByRole("button", { name: "Create new document" }).click();

  const titleEditor = getTitleEditor(page);
  await titleEditor.click();
  await titleEditor.fill(options.title);
  await titleEditor.blur();

  const contentEditor = getContentEditor(page);
  await contentEditor.fill(options.content);

  // Wait for auto-save
  await page.waitForTimeout(1000);

  // Return the current URL (document URL)
  return page.url();
}

// Type text sequentially with a delay between characters
// Useful for simulating real user typing in collaboration scenarios
export async function typeText(page: Page, text: string, options?: { delay?: number }) {
  const contentEditor = getContentEditor(page);
  await contentEditor.click();
  await contentEditor.pressSequentially(text, { delay: options?.delay ?? 50 });
}

// Wait for content to appear in the editor
// Useful for waiting for real-time collaboration updates
export async function waitForContent(
  page: Page,
  expectedText: string,
  options?: { timeout?: number },
) {
  const contentEditor = getContentEditor(page);
  await contentEditor.locator(`:text("${expectedText}")`).waitFor({
    state: "visible",
    timeout: options?.timeout ?? 5000,
  });
}

// Get the full text content from the editor
export async function getEditorContent(page: Page): Promise<string> {
  const contentEditor = getContentEditor(page);
  const content = await contentEditor.textContent();
  return content || "";
}

// Navigate both users to the same document
export async function navigateBothToDocument(
  user1Page: Page,
  user2Page: Page,
  documentUrl: string,
) {
  await Promise.all([
    user1Page.goto(documentUrl, { waitUntil: "networkidle" }),
    user2Page.goto(documentUrl, { waitUntil: "networkidle" }),
  ]);
}

// Clean up a user context by closing it
export async function cleanupUserContext(context: BrowserContext) {
  try {
    await context.close();
  } catch (error) {
    console.error("Failed to cleanup user context:", error);
  }
}
