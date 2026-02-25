import type { Page } from "@playwright/test";

/**
 * Creates a new document with the given title and content.
 * Uses a short timeout for auto-save wait.
 */
export async function createDocument(
  page: Page,
  options: { title: string; content: string },
  autoSaveDelay = 500,
): Promise<string> {
  await page.getByRole("button", { name: "Create new document" }).click();
  await page.waitForURL(/\/w\/[^/]+\/[^/]+/);

  const titleEditor = page.getByLabel("Document title").locator('[contenteditable="true"]').first();
  await titleEditor.waitFor({ state: "visible" });
  await titleEditor.click();
  await titleEditor.fill(options.title);
  await titleEditor.blur();

  if (options.content) {
    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();
    await contentEditor.waitFor({ state: "visible" });
    await contentEditor.click();
    await contentEditor.pressSequentially(options.content, { delay: 10 });
    await contentEditor.blur();
  }

  // Short wait for auto-save
  if (autoSaveDelay > 0) {
    await page.waitForTimeout(autoSaveDelay);
  }

  return page.url();
}

/**
 * Waits for the workspace page to be fully loaded.
 */
export async function waitForWorkspace(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Quick Action" }).waitFor({ state: "visible" });
}

/**
 * Navigates to a workspace and waits for it to load.
 */
export async function gotoWorkspace(page: Page, organizationSlug: string): Promise<void> {
  await page.goto(`/w/${organizationSlug}`);
  await waitForWorkspace(page);
}
