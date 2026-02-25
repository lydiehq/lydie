import { db, organizationsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

import { expect, test } from "./fixtures/auth.fixture";
import { createTestOrganization } from "./utils/db";

test.describe("workspace management", () => {
  test("should be able to create a new workspace through organization menu", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: organization.name }).first().click();

    await page.getByRole("menuitem", { name: "Switch workspace" }).click();

    await expect(page.getByRole("heading", { name: "My workspaces" })).toBeVisible();

    await page.getByRole("link", { name: "Create workspace" }).click();
    await expect(page.getByRole("heading", { name: "Create Workspace" })).toBeVisible();

    const newWorkspaceName = `New Workspace ${Date.now()}`;
    await page.getByLabel("Workspace Name").fill(newWorkspaceName);

    await page.getByRole("button", { name: "Create Workspace" }).click();

    await page.waitForURL(/\/w\/[\w-]+/);

    await expect(page.getByRole("button", { name: newWorkspaceName }).first()).toBeVisible();
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
