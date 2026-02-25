import { createId } from "@lydie/core/id";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import { db, documentsTable, organizationsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

import { expect, test } from "./fixtures/auth.fixture";
import { createTestOrganization } from "./utils/db";
import { triggerCommandMenuShortcut } from "./utils/command-menu";

test.describe("command menu", () => {
  test("can open command menu via keyboard and button", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Test keyboard shortcut
    await triggerCommandMenuShortcut(page);
    await expect(page.getByRole("dialog")).toBeVisible();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Test sidebar button
    await page.getByRole("button", { name: "Quick Action" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("can navigate via command menu", async ({ page, organization }) => {
    // Start on assistant page
    await page.goto(`/w/${organization.slug}/assistant`);
    await page.waitForLoadState("domcontentloaded");

    // Navigate to home
    await triggerCommandMenuShortcut(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("menuitem", { name: "Go home" }).click();
    await page.waitForURL(`/w/${organization.slug}`);

    // Navigate to assistant
    await triggerCommandMenuShortcut(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("menuitem", { name: "Go to assistant" }).click();
    await page.waitForURL(`/w/${organization.slug}/assistant`);
  });

  test("can search documents", async ({ page, organization, user }) => {
    // Create test documents directly in DB
    const documentId = createId();
    const documentTitle = `Search Test ${Date.now()}`;

    const emptyContent = { type: "doc", content: [] };
    const yjsState = convertJsonToYjs(emptyContent);
    await db.insert(documentsTable).values({
      id: documentId,
      title: documentTitle,
      slug: documentId,
      yjsState,
      userId: user.id,
      organizationId: organization.id,
      published: false,
    });

    try {
      await page.goto(`/w/${organization.slug}`);
      await page.waitForLoadState("domcontentloaded");

      // Open command menu
      await triggerCommandMenuShortcut(page);

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const searchInput = dialog.getByPlaceholder("Type a command or search...");
      await expect(searchInput).toBeVisible();

      // Search for the document
      await searchInput.fill("Search Test");
      await expect(page.getByRole("menuitem", { name: documentTitle })).toBeVisible({
        timeout: 5000,
      });
    } finally {
      await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
    }
  });

  test("can open workspace submenu and return with backspace", async ({
    page,
    organization,
    user,
  }) => {
    const secondWorkspace = await createTestOrganization(user.id, {
      prefix: "command-workspace",
      name: `Command Menu Workspace ${Date.now()}`,
      slug: `command-menu-workspace-${Date.now()}`,
    });

    try {
      await page.goto(`/w/${organization.slug}`);
      await page.waitForLoadState("domcontentloaded");

      await triggerCommandMenuShortcut(page);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.getByRole("menuitem", { name: "Switch workspace" }).click();

      await expect(dialog.getByText("Command menu / Switch workspace")).toBeVisible();
      await expect(dialog.getByRole("menuitem", { name: secondWorkspace.name })).toBeVisible();

      const searchInput = dialog.getByPlaceholder("Search workspaces...");
      await searchInput.press("Backspace");

      await expect(dialog.getByRole("menuitem", { name: "Go home" })).toBeVisible();
      await expect(dialog.getByRole("menuitem", { name: "Switch workspace" })).toBeVisible();
    } finally {
      await db.delete(organizationsTable).where(eq(organizationsTable.id, secondWorkspace.id));
    }
  });
});
