import { expect, test } from "./fixtures/auth.fixture";

test.describe("assistant", () => {
  test("can open and close assistant when undocked", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Find and click the assistant button
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await expect(assistantButton).toBeVisible();
    await assistantButton.click();

    // Verify assistant is open (wait a bit for state initialization)
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("AI Assistant")).toBeVisible();

    // Close the assistant
    const closeButton = page.getByRole("button", { name: "Close assistant" });
    await closeButton.click();

    // Verify assistant is closed (button should be visible again)
    await expect(assistantButton).toBeVisible();
    await expect(assistantWindow).not.toBeVisible();
  });

  test("can dock and undock assistant", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open the assistant
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    // Verify assistant is open in floating mode
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible();

    // Dock the assistant
    const dockButton = page.getByRole("button", { name: "Dock assistant" });
    await dockButton.click();

    // Verify assistant is docked (should be in a panel, not floating)
    await expect(assistantWindow).toBeVisible();
    // The docked panel should be visible
    const dockedPanel = page.locator('[id="assistant-panel"]');
    await expect(dockedPanel).toBeVisible();

    // Verify undock button is visible
    const undockButton = page.getByRole("button", { name: "Undock assistant" });
    await expect(undockButton).toBeVisible();

    // Undock the assistant
    await undockButton.click();

    // Verify assistant is back to floating mode
    await expect(assistantWindow).toBeVisible();
    // The docked panel should not be visible
    await expect(dockedPanel).not.toBeVisible();
  });

  test("persists docked state across page refresh", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open and dock the assistant
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    const dockButton = page.getByRole("button", { name: "Dock assistant" });
    await dockButton.click();

    // Verify it's docked
    const dockedPanel = page.locator('[id="assistant-panel"]');
    await expect(dockedPanel).toBeVisible();

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Verify assistant is still docked after refresh
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible();
    await expect(dockedPanel).toBeVisible();
    await expect(page.getByRole("button", { name: "Undock assistant" })).toBeVisible();
  });

  test("persists open state across page refresh when undocked", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open the assistant (undocked)
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    // Verify it's open
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible();

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Verify assistant is still open after refresh
    await expect(assistantWindow).toBeVisible();
    await expect(page.getByText("AI Assistant")).toBeVisible();
  });

  test("hides docked assistant on settings route", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open and dock the assistant
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    const dockButton = page.getByRole("button", { name: "Dock assistant" });
    await dockButton.click();

    // Verify it's docked
    const dockedPanel = page.locator('[id="assistant-panel"]');
    await expect(dockedPanel).toBeVisible();

    // Navigate to settings
    await page.goto(`/w/${organization.slug}/settings`);
    await page.waitForLoadState("networkidle");

    // Verify docked panel is hidden on settings route
    await expect(dockedPanel).not.toBeVisible();

    // Navigate back
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Verify docked panel is visible again
    await expect(dockedPanel).toBeVisible();
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible();
  });

  test("remembers closed state across page refresh when undocked", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open and then close the assistant
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    const closeButton = page.getByRole("button", { name: "Close assistant" });
    await closeButton.click();

    // Verify it's closed
    await expect(assistantButton).toBeVisible();
    await expect(assistantWindow).not.toBeVisible();

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Verify assistant is still closed after refresh
    await expect(assistantButton).toBeVisible();
    await expect(assistantWindow).not.toBeVisible();
  });

  test("maintains conversation state when refreshing before sending first message", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open the assistant
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    // Verify assistant is open
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    // Get the conversation ID from localStorage
    const conversationIdBefore = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });

    // Refresh the page without sending a message
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Verify assistant is still open
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    // Verify the conversation ID is the same
    const conversationIdAfter = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });

    expect(conversationIdBefore).toBe(conversationIdAfter);
  });

  test("creates new conversation when clicking new chat button", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open the assistant
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    // Verify assistant is open
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    // Get the initial conversation ID
    const conversationIdBefore = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });

    // Click the new chat button
    const newChatButton = page.getByRole("button", { name: "New chat" });
    await newChatButton.click();

    // Wait a bit for the state to update
    await page.waitForTimeout(500);

    // Get the new conversation ID
    const conversationIdAfter = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).id : null;
    });

    // Verify the conversation ID changed
    expect(conversationIdBefore).not.toBe(conversationIdAfter);
  });

  test("handles conversation state transitions correctly", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Open the assistant
    const assistantButton = page.getByRole("button", {
      name: "Open AI Assistant",
    });
    await assistantButton.click();

    // Verify assistant is open
    const assistantWindow = page.getByRole("region", { name: "AI Assistant" });
    await expect(assistantWindow).toBeVisible({ timeout: 10000 });

    // Verify initial state is "idle"
    const initialState = await page.evaluate(() => {
      const stored = localStorage.getItem("assistant:conversation");
      return stored ? JSON.parse(stored).state : null;
    });
    expect(initialState).toBe("idle");

    // Type a message (but don't send yet)
    const input = page.locator('[contenteditable="true"]').first();
    await input.click();
    await input.fill("Hello, assistant!");

    // Note: We're not testing the full flow with sending messages here
    // as that would require mocking the AI backend, but the state machine
    // should transition from idle -> creating -> ready when a message is sent
  });
});
