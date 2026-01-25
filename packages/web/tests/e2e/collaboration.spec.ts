import type { Page } from "@playwright/test";

import { createUser2Context, expect, test } from "./fixtures/auth-multi-user.fixture";
import { test as singleUserTest } from "./fixtures/auth.fixture";

test.describe("real-time collaboration - same user (two tabs)", () => {
  singleUserTest(
    "changes sync between two tabs of the same user",
    async ({ page: tab1, context, organization }) => {
      // Create a second tab in the same context (same user)
      const tab2 = await context.newPage();

      try {
        // Tab 1 creates a document
        await tab1.goto(`/w/${organization.slug}`, {
          waitUntil: "networkidle",
        });
        const documentUrl = await createDocument(tab1, {
          title: "Same User Collab Test",
          content: "Initial content",
        });

        // Tab 2 navigates to the same document
        await tab2.goto(documentUrl, { waitUntil: "networkidle" });

        const tab1ContentEditor = tab1
          .getByLabel("Document content")
          .locator('[contenteditable="true"]')
          .first();

        const tab2ContentEditor = tab2
          .getByLabel("Document content")
          .locator('[contenteditable="true"]')
          .first();

        // Verify both tabs see initial content
        await expect(tab1ContentEditor).toContainText("Initial content");
        await expect(tab2ContentEditor).toContainText("Initial content");

        // Tab 1 adds text
        await tab1ContentEditor.click();
        await tab1ContentEditor.press("End");
        await tab1ContentEditor.pressSequentially(" - Added from Tab 1", {
          delay: 50,
        });

        // Verify Tab 2 sees the change
        await expect(tab2ContentEditor).toContainText("Initial content - Added from Tab 1", {
          timeout: 5000,
        });

        // Tab 2 adds text
        await tab2ContentEditor.click();
        await tab2ContentEditor.press("End");
        await tab2ContentEditor.pressSequentially(" - Added from Tab 2", {
          delay: 50,
        });

        // Verify Tab 1 sees Tab 2's change
        await expect(tab1ContentEditor).toContainText(
          "Initial content - Added from Tab 1 - Added from Tab 2",
          { timeout: 5000 },
        );

        // Verify both tabs have the same final content
        const tab1Content = await tab1ContentEditor.textContent();
        const tab2Content = await tab2ContentEditor.textContent();
        expect(tab1Content).toBe(tab2Content);
      } finally {
        await tab2.close();
      }
    },
  );
});

test.describe("real-time collaboration - different users", () => {
  test("two users can edit the same document simultaneously", async ({
    page: user1Page,
    browser,
    workerData,
    organization,
  }) => {
    // Create a context for user2
    const baseURL = user1Page.url() || "http://localhost:3000";
    const user2Context = await createUser2Context(browser, workerData, baseURL);
    const user2Page = await user2Context.newPage();

    try {
      // User1 creates a document
      await user1Page.goto(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      const documentUrl = await createDocument(user1Page, {
        title: "Collaboration Test Doc",
        content: "Initial content",
      });

      // User2 navigates to the same document
      await user2Page.goto(documentUrl, { waitUntil: "networkidle" });

      // Get editors for both users
      const user1ContentEditor = user1Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      const user2ContentEditor = user2Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      // Verify both users see initial content
      await expect(user1ContentEditor).toContainText("Initial content");
      await expect(user2ContentEditor).toContainText("Initial content");

      // User1 adds text
      await user1ContentEditor.click();
      await user1ContentEditor.press("End"); // Move to end of content
      await user1ContentEditor.pressSequentially(" - Added by User 1", {
        delay: 50,
      });

      // Wait for sync and verify User2 sees the change
      await expect(user2ContentEditor).toContainText("Initial content - Added by User 1", {
        timeout: 5000,
      });

      // User2 adds text
      await user2ContentEditor.click();
      await user2ContentEditor.press("End");
      await user2ContentEditor.pressSequentially(" - Added by User 2", {
        delay: 50,
      });

      // Verify User1 sees User2's change
      await expect(user1ContentEditor).toContainText(
        "Initial content - Added by User 1 - Added by User 2",
        {
          timeout: 5000,
        },
      );

      // Verify both users have the same final content
      const user1Content = await user1ContentEditor.textContent();
      const user2Content = await user2ContentEditor.textContent();
      expect(user1Content).toBe(user2Content);
    } finally {
      await user2Context.close();
    }
  });

  test("changes sync when user edits in the middle of text", async ({
    page: user1Page,
    browser,
    workerData,
    organization,
  }) => {
    const baseURL = user1Page.url() || "http://localhost:3000";
    const user2Context = await createUser2Context(browser, workerData, baseURL);
    const user2Page = await user2Context.newPage();

    try {
      // User1 creates a document
      await user1Page.goto(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      const documentUrl = await createDocument(user1Page, {
        title: "Middle Edit Test",
        content: "Start End",
      });

      // User2 navigates to the same document
      await user2Page.goto(documentUrl, { waitUntil: "networkidle" });

      const user1ContentEditor = user1Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      const user2ContentEditor = user2Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      // User1 clicks in the middle and adds text
      await user1ContentEditor.click();
      // Position cursor between "Start" and "End"
      await user1ContentEditor.press("End");
      await user1ContentEditor.press("ArrowLeft"); // Move before "End"
      await user1ContentEditor.press("ArrowLeft");
      await user1ContentEditor.press("ArrowLeft");
      await user1ContentEditor.press("ArrowLeft");
      await user1ContentEditor.pressSequentially("Middle ", { delay: 50 });

      // Verify User2 sees the change
      await expect(user2ContentEditor).toContainText("Start Middle End", {
        timeout: 5000,
      });
    } finally {
      await user2Context.close();
    }
  });

  test("title changes sync between users", async ({
    page: user1Page,
    browser,
    workerData,
    organization,
  }) => {
    const baseURL = user1Page.url() || "http://localhost:3000";
    const user2Context = await createUser2Context(browser, workerData, baseURL);
    const user2Page = await user2Context.newPage();

    try {
      // User1 creates a document
      await user1Page.goto(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      const documentUrl = await createDocument(user1Page, {
        title: "Original Title",
        content: "Some content",
      });

      // User2 navigates to the same document
      await user2Page.goto(documentUrl, { waitUntil: "networkidle" });

      const user1TitleEditor = user1Page
        .getByLabel("Document title")
        .locator('[contenteditable="true"]')
        .first();

      const user2TitleEditor = user2Page
        .getByLabel("Document title")
        .locator('[contenteditable="true"]')
        .first();

      // Verify both users see original title
      await expect(user1TitleEditor).toHaveText("Original Title");
      await expect(user2TitleEditor).toHaveText("Original Title");

      // User1 changes title
      await user1TitleEditor.click();
      await user1TitleEditor.fill("Updated Title");
      await user1TitleEditor.blur();

      // Give it a moment to sync
      await user1Page.waitForTimeout(1000);

      // Verify User2 sees the updated title
      await expect(user2TitleEditor).toHaveText("Updated Title", {
        timeout: 5000,
      });

      // Verify sidebar is updated for both users
      const user1Sidebar = user1Page.getByRole("treegrid", {
        name: "Documents",
      });
      const user2Sidebar = user2Page.getByRole("treegrid", {
        name: "Documents",
      });

      await expect(user1Sidebar.getByRole("row", { name: "Updated Title" })).toBeVisible();
      await expect(user2Sidebar.getByRole("row", { name: "Updated Title" })).toBeVisible();
    } finally {
      await user2Context.close();
    }
  });

  test("title syncs only on blur (not real-time like content)", async ({
    page: user1Page,
    browser,
    workerData,
    organization,
  }) => {
    const baseURL = user1Page.url() || "http://localhost:3000";
    const user2Context = await createUser2Context(browser, workerData, baseURL);
    const user2Page = await user2Context.newPage();

    try {
      // User1 creates a document
      await user1Page.goto(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      const documentUrl = await createDocument(user1Page, {
        title: "Initial Title",
        content: "Initial content",
      });

      // User2 navigates to the same document
      await user2Page.goto(documentUrl, { waitUntil: "networkidle" });

      const user1TitleEditor = user1Page
        .getByLabel("Document title")
        .locator('[contenteditable="true"]')
        .first();

      const user2TitleEditor = user2Page
        .getByLabel("Document title")
        .locator('[contenteditable="true"]')
        .first();

      const user1ContentEditor = user1Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      const user2ContentEditor = user2Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      // Verify both users see initial title and content
      await expect(user1TitleEditor).toHaveText("Initial Title");
      await expect(user2TitleEditor).toHaveText("Initial Title");
      await expect(user1ContentEditor).toContainText("Initial content");
      await expect(user2ContentEditor).toContainText("Initial content");

      // User1 starts typing in the title (but doesn't blur yet)
      await user1TitleEditor.click();
      await user1TitleEditor.pressSequentially(" - Typing", { delay: 50 });

      // Wait a moment - User2 should NOT see the title change yet (not real-time)
      await user2Page.waitForTimeout(1000);
      await expect(user2TitleEditor).toHaveText("Initial Title");

      // Contrast: User1 types in content editor - this SHOULD sync in real-time
      await user1ContentEditor.click();
      await user1ContentEditor.press("End");
      await user1ContentEditor.pressSequentially(" - Real-time", { delay: 50 });

      // User2 should see content change in real-time (via Hocuspocus)
      await expect(user2ContentEditor).toContainText("Initial content - Real-time", {
        timeout: 5000,
      });

      // Now User1 blurs the title editor - this should trigger Zero sync
      await user1TitleEditor.blur();

      // Give Zero sync a moment to propagate
      await user1Page.waitForTimeout(1000);

      // Now User2 should see the title change (after blur, via Zero sync)
      await expect(user2TitleEditor).toHaveText("Initial Title - Typing", {
        timeout: 5000,
      });

      // Verify sidebar is updated for both users
      const user2Sidebar = user2Page.getByRole("treegrid", {
        name: "Documents",
      });
      await expect(user2Sidebar.getByRole("row", { name: "Initial Title - Typing" })).toBeVisible({
        timeout: 5000,
      });
    } finally {
      await user2Context.close();
    }
  });

  test("multiple rapid edits sync correctly", async ({
    page: user1Page,
    browser,
    workerData,
    organization,
  }) => {
    const baseURL = user1Page.url() || "http://localhost:3000";
    const user2Context = await createUser2Context(browser, workerData, baseURL);
    const user2Page = await user2Context.newPage();

    try {
      // User1 creates a document
      await user1Page.goto(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      const documentUrl = await createDocument(user1Page, {
        title: "Rapid Edits Test",
        content: "",
      });

      // User2 navigates to the same document
      await user2Page.goto(documentUrl, { waitUntil: "networkidle" });

      const user1ContentEditor = user1Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      const user2ContentEditor = user2Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      // User1 types multiple words rapidly
      await user1ContentEditor.click();
      await user1ContentEditor.pressSequentially("One Two Three", {
        delay: 30,
      });

      // User2 should see all the text
      await expect(user2ContentEditor).toContainText("One Two Three", {
        timeout: 5000,
      });

      // User2 adds to it
      await user2ContentEditor.click();
      await user2ContentEditor.press("End");
      await user2ContentEditor.pressSequentially(" Four Five", { delay: 30 });

      // User1 should see User2's additions
      await expect(user1ContentEditor).toContainText("One Two Three Four Five", {
        timeout: 5000,
      });
    } finally {
      await user2Context.close();
    }
  });

  test("concurrent edits at different positions merge correctly", async ({
    page: user1Page,
    browser,
    workerData,
    organization,
  }) => {
    const baseURL = user1Page.url() || "http://localhost:3000";
    const user2Context = await createUser2Context(browser, workerData, baseURL);
    const user2Page = await user2Context.newPage();

    try {
      // User1 creates a document with multiple paragraphs
      await user1Page.goto(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      const documentUrl = await createDocument(user1Page, {
        title: "Concurrent Edits Test",
        content: "Paragraph 1\n\nParagraph 2\n\nParagraph 3",
      });

      // User2 navigates to the same document
      await user2Page.goto(documentUrl, { waitUntil: "networkidle" });

      const user1ContentEditor = user1Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      const user2ContentEditor = user2Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      // User1 edits the beginning
      await user1ContentEditor.click();
      await user1ContentEditor.press("Home");
      await user1ContentEditor.pressSequentially("Start: ", { delay: 30 });

      // User2 edits the end (without waiting for User1's changes)
      await user2ContentEditor.click();
      await user2ContentEditor.press("End");
      await user2ContentEditor.pressSequentially(" :End", { delay: 30 });

      // Both changes should be present in both editors
      await expect(user1ContentEditor).toContainText("Start: ", {
        timeout: 5000,
      });
      await expect(user1ContentEditor).toContainText(":End", { timeout: 5000 });

      await expect(user2ContentEditor).toContainText("Start: ", {
        timeout: 5000,
      });
      await expect(user2ContentEditor).toContainText(":End", { timeout: 5000 });

      // Verify the content is identical
      const user1Content = await user1ContentEditor.textContent();
      const user2Content = await user2ContentEditor.textContent();
      expect(user1Content).toBe(user2Content);
    } finally {
      await user2Context.close();
    }
  });

  test("user can see other user's cursor/caret", async ({
    page: user1Page,
    browser,
    workerData,
    organization,
    user2,
  }) => {
    const baseURL = user1Page.url() || "http://localhost:3000";
    const user2Context = await createUser2Context(browser, workerData, baseURL);
    const user2Page = await user2Context.newPage();

    try {
      // User1 creates a document
      await user1Page.goto(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      const documentUrl = await createDocument(user1Page, {
        title: "Cursor Test",
        content: "Test content for cursor visibility",
      });

      // User2 navigates to the same document
      await user2Page.goto(documentUrl, { waitUntil: "networkidle" });

      const user2ContentEditor = user2Page
        .getByLabel("Document content")
        .locator('[contenteditable="true"]')
        .first();

      // User2 clicks in the editor to position their cursor
      await user2ContentEditor.click();

      // User1 should see a collaboration caret element
      // The CollaborationCaret extension adds elements with class 'collaboration-cursor__caret'
      // Note: The actual class name may vary based on your Tiptap configuration
      const collaborationCursor = user1Page.locator(".collaboration-cursor__caret");

      // Wait for the collaboration cursor to appear
      await expect(collaborationCursor).toBeVisible({ timeout: 5000 });

      // Optionally, check for the user name label if it's rendered
      // This depends on your CollaborationCaret configuration
      const userLabel = user1Page.locator(".collaboration-cursor__label");
      if ((await userLabel.count()) > 0) {
        await expect(userLabel.first()).toContainText(user2.user.name, {
          timeout: 5000,
        });
      }
    } finally {
      await user2Context.close();
    }
  });
});

// Helper function to create a document and return its URL
async function createDocument(
  page: Page,
  options: { title: string; content: string },
): Promise<string> {
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

  // Return the current URL (document URL)
  return page.url();
}
