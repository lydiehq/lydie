import { db, organizationsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

import { expect, test } from "./fixtures/auth.fixture";
import { createTestOrganization } from "./utils/db";

test.describe("workspace management", () => {
  test("should create a workspace from create page", async ({ page }) => {
    await page.goto("/new", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Create Workspace" })).toBeVisible();

    const workspaceName = `Workspace ${Date.now()}`;
    await page.getByLabel("Workspace Name").fill(workspaceName);
    await page.getByRole("button", { name: "Create Workspace" }).click();

    await page.waitForURL(/\/w\/[\w-]+(?:\/[\w-]+)?$/);

    const [createdWorkspace] = await db
      .select({ id: organizationsTable.id, slug: organizationsTable.slug })
      .from(organizationsTable)
      .where(eq(organizationsTable.name, workspaceName))
      .limit(1);

    expect(createdWorkspace?.id).toBeTruthy();
    expect(page.url()).toContain("/w/");
    expect(page.url()).toContain(`/w/${createdWorkspace?.slug ?? ""}`);

    await page.getByRole("button", { name: workspaceName }).first().click();
    await page.getByRole("menuitem", { name: "Switch workspace" }).click();
    await expect(page.getByRole("dialog").getByText(workspaceName, { exact: true })).toBeVisible({
      timeout: 15000,
    });
  });

  test("should navigate to create workspace page through organization menu", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: organization.name }).first().click();

    await page.getByRole("menuitem", { name: "Switch workspace" }).click();

    await expect(page.getByRole("heading", { name: "My workspaces" })).toBeVisible();

    await page.getByRole("link", { name: "Create workspace" }).click();
    await page.waitForURL("/new");
    await expect(page.getByRole("heading", { name: "Create Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Workspace" })).toBeVisible();
  });

  test("should be able to switch between workspaces", async ({ page, organization, user }) => {
    const secondWorkspaceName = `Second Test Workspace ${Date.now()}`;
    const secondWorkspace = await createTestOrganization(user.id, {
      prefix: "second-workspace",
      name: secondWorkspaceName,
      slug: `second-workspace-${user.id}-${Date.now()}`,
    });

    try {
      await page.goto(`/w/${organization.slug}`);
      await page.waitForURL(`/w/${organization.slug}`);

      await page.getByRole("button", { name: organization.name }).first().click();

      await page.getByRole("menuitem", { name: "Switch workspace" }).click();

      const workspaceDialog = page.getByRole("dialog");
      await expect(workspaceDialog.getByRole("heading", { name: "My workspaces" })).toBeVisible();
      await workspaceDialog.getByText(secondWorkspaceName, { exact: true }).click();

      await page.waitForURL(`/w/${secondWorkspace.slug}`);

      await expect(page.getByRole("button", { name: secondWorkspaceName }).first()).toBeVisible();
    } finally {
      await db.delete(organizationsTable).where(eq(organizationsTable.id, secondWorkspace.id));
    }
  });
});

test.describe("workspace access isolation", () => {
  test("should allow access to workspace route for authenticated user", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await expect(page).toHaveURL(new RegExp(`/w/${organization.slug}(/.*)?$`));
  });
});
