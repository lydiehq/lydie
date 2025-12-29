import { expect, test } from "./fixtures/auth.fixture";
import { db, documentsTable, foldersTable } from "@lydie/database";
import { createId } from "@lydie/core/id";
import { eq } from "drizzle-orm";
import { triggerCommandMenuShortcut } from "./utils/command-menu";

test.describe("command menu", () => {
  test("can open command menu with keyboard shortcut", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the sidebar to be visible (ensures page is fully loaded)
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Trigger Cmd+K keyboard shortcut
    await triggerCommandMenuShortcut(page);

    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("can open command menu with sidebar button", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Quick Action" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("can navigate to home via command menu", async ({
    page,
    organization,
  }) => {
    // Navigate to a different page first
    await page.goto(`/w/${organization.slug}/assistant`);
    await page.waitForLoadState("networkidle");

    // Wait for the page to be fully loaded
    await page.getByRole("button", { name: "Quick Action" }).waitFor();

    // Trigger Cmd+K keyboard shortcut
    await triggerCommandMenuShortcut(page);

    await expect(page.getByRole("dialog")).toBeVisible();

    // Click "Go home" option
    await page.getByRole("option", { name: "Go home" }).click();

    // Verify navigation to home
    await page.waitForURL(`/w/${organization.slug}`, {
      waitUntil: "networkidle",
    });
  });

  test("can navigate to assistant via command menu", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Quick Action" }).waitFor();
    await triggerCommandMenuShortcut(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("option", { name: "Go to assistant" }).click();

    await page.waitForURL(`/w/${organization.slug}/assistant`, {
      waitUntil: "networkidle",
    });
  });

  test("should search documents and folders", async ({
    page,
    organization,
    user,
  }) => {
    // Create test document and folder
    const documentId = createId();
    const folderId = createId();
    const documentTitle = `Test Document ${Date.now()}`;
    const folderName = `Test Folder ${Date.now()}`;

    await db.insert(documentsTable).values({
      id: documentId,
      title: documentTitle,
      slug: documentId,
      jsonContent: { type: "doc", content: [] },
      userId: user.id,
      organizationId: organization.id,
      indexStatus: "outdated",
      published: false,
    });

    await db.insert(foldersTable).values({
      id: folderId,
      name: folderName,
      userId: user.id,
      organizationId: organization.id,
    });

    try {
      await page.goto(`/w/${organization.slug}`);
      await page.waitForURL(`/w/${organization.slug}`, {
        waitUntil: "networkidle",
      });
      await triggerCommandMenuShortcut(page);

      await expect(page.getByRole("dialog")).toBeVisible();

      // Click on "Search" option to navigate to search page
      await page
        .getByRole("option", { name: "Search documents and folders…" })
        .click();

      // Wait for search page to be active (input should be enabled)
      // Scope the search input to only the dialog to avoid matching the main page search field
      const dialog = page.getByRole("dialog");
      const searchInput = dialog.getByPlaceholder(
        "Search documents and folders..."
      );

      // Type search query
      await searchInput.fill("Test");

      // Wait for search results to appear
      await expect(
        page.getByRole("option", { name: documentTitle })
      ).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole("option", { name: folderName })).toBeVisible({
        timeout: 5000,
      });
    } finally {
      // Cleanup
      await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
      await db.delete(foldersTable).where(eq(foldersTable.id, folderId));
    }
  });

  test("should open command menu in search mode when clicking search button", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForLoadState("networkidle");

    // Wait for the sidebar to be visible (ensures page is fully loaded)
    const quickActionButton = page.getByRole("button", {
      name: "Quick Action",
    });
    await quickActionButton.waitFor();

    // Click the search button
    const searchButton = page.getByRole("button", { name: "Search" });
    await searchButton.click();

    // Verify command menu opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify it opens directly in search mode
    // Scope the search input to only the dialog to avoid matching the main page search field
    const searchInput = dialog.getByPlaceholder(
      "Search documents and folders..."
    );
    await expect(searchInput).toBeEnabled();
    await expect(searchInput).toBeVisible();
  });
});
