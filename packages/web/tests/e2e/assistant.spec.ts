import { expect, test } from "./fixtures/auth.fixture";
import { gotoWorkspace } from "./utils/document";

test.describe("assistant", () => {
  test("can open, dock, and close assistant", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    const assistantButton = page.getByRole("button", { name: "Open AI Assistant" });
    await expect(assistantButton).toBeVisible();
    await assistantButton.click();

    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    // Dock the assistant
    const dockButton = page.getByRole("button", { name: "Dock assistant" });
    await dockButton.click();

    const dockedPanel = page.locator('[id="assistant-panel"]');
    await expect(dockedPanel).toBeVisible();
    await expect(page.getByRole("button", { name: "Undock assistant" })).toBeVisible();

    // Undock the assistant
    await page.getByRole("button", { name: "Undock assistant" }).click();
    await expect(dockedPanel).not.toBeVisible();
    await expect(assistantWindow).toBeVisible();

    // Close the assistant
    await page.getByRole("button", { name: "Close assistant" }).click();
    await expect(assistantButton).toBeVisible();
    await expect(assistantWindow).not.toBeVisible();
  });

  test("persists docked and open state across page refresh", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    await page.getByRole("button", { name: "Open AI Assistant" }).click();
    await page.getByRole("button", { name: "Dock assistant" }).click();

    const dockedPanel = page.locator('[id="assistant-panel"]');
    await expect(dockedPanel).toBeVisible();

    const conversationIdBefore = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });

    // Refresh and verify state persists
    await page.reload();
    await gotoWorkspace(page, organization.slug);

    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible();
    await expect(dockedPanel).toBeVisible();
    await expect(page.getByRole("button", { name: "Undock assistant" })).toBeVisible();

    const conversationIdAfter = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });
    expect(conversationIdBefore).toBe(conversationIdAfter);
  });

  test("hides docked assistant on settings route", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    await page.getByRole("button", { name: "Open AI Assistant" }).click();
    await page.getByRole("button", { name: "Dock assistant" }).click();

    const dockedPanel = page.locator('[id="assistant-panel"]');
    await expect(dockedPanel).toBeVisible();

    // Navigate to settings - docked panel should hide
    await page.goto(`/w/${organization.slug}/settings`);
    await page.waitForLoadState("domcontentloaded");
    await expect(dockedPanel).not.toBeVisible();

    // Navigate back - docked panel should show
    await gotoWorkspace(page, organization.slug);
    await expect(dockedPanel).toBeVisible();
  });

  test("remembers closed state and can create new conversation", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);

    const assistantButton = page.getByRole("button", { name: "Open AI Assistant" });
    await assistantButton.click();

    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    const conversationIdBefore = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });

    await page.getByRole("button", { name: "Close assistant" }).click();
    await expect(assistantWindow).not.toBeVisible();

    // Refresh and verify closed state persists
    await page.reload();
    await gotoWorkspace(page, organization.slug);
    await expect(assistantButton).toBeVisible();
    await expect(assistantWindow).not.toBeVisible();

    // Re-open and create new conversation
    await assistantButton.click();
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "New chat" }).click();
    await page.waitForTimeout(300);

    const conversationIdAfter = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });

    expect(conversationIdBefore).not.toBe(conversationIdAfter);
  });
});
