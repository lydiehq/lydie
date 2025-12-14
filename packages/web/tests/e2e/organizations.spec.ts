import { expect, test } from "./fixtures/auth.fixture";
import { createTestUser, createTestOrganization } from "./utils/db";
import { db, organizationsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

test.describe("organization management", () => {
  test("should be able to create a new workspace through organization menu", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.id}`);
    await page.waitForURL(`/w/${organization.id}`, { timeout: 5000 });

    await page.getByRole("button", { name: organization.name }).first().click();

    await page.getByRole("menuitem", { name: "Switch organization" }).click();

    await expect(
      page.getByRole("heading", { name: "My organizations" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Create organization" }).click();
    await page.waitForURL("/onboarding", { timeout: 5000 });

    await expect(
      page.getByRole("heading", { name: "Welcome to Lydie" })
    ).toBeVisible();

    const newWorkspaceName = `New Workspace ${Date.now()}`;
    await page.getByLabel("Workspace Name").fill(newWorkspaceName);

    await page.getByRole("button", { name: "Create Workspace" }).click();

    await page.waitForURL(/\/w\/[\w-]+/, { timeout: 10000 });

    await expect(
      page.getByRole("button", { name: newWorkspaceName }).first()
    ).toBeVisible();
  });

  test("should be able to switch between organizations", async ({
    page,
    organization,
    user,
  }) => {
    const secondOrgName = `Second Test Org ${Date.now()}`;
    const secondOrg = await createTestOrganization(user.id, {
      prefix: "second-org",
      name: secondOrgName,
      slug: `second-org-${user.id}-${Date.now()}`,
    });

    try {
      await page.goto(`/w/${organization.id}`);
      await page.waitForURL(`/w/${organization.id}`, { timeout: 5000 });

      await page
        .getByRole("button", { name: organization.name })
        .first()
        .click();

      await page.getByRole("menuitem", { name: "Switch organization" }).click();

      await expect(
        page.getByRole("heading", { name: "My organizations" })
      ).toBeVisible();

      await expect(page.getByText(organization.name)).toBeVisible();
      await expect(page.getByText(secondOrgName)).toBeVisible();

      await page.getByRole("button").filter({ hasText: secondOrgName }).click();

      await page.waitForURL(`/w/${secondOrg.id}`, { timeout: 5000 });

      await expect(
        page.getByRole("button", { name: secondOrgName }).first()
      ).toBeVisible();
    } finally {
      await db
        .delete(organizationsTable)
        .where(eq(organizationsTable.id, secondOrg.id));
    }
  });
});

test.describe("organization access isolation", () => {
  test("should not allow access to workspace route of another organization", async ({
    page,
  }) => {
    const { organization, cleanup } = await createTestUser({
      prefix: "other",
    });

    try {
      await page.goto(`/w/${organization.id}`);
      await expect(
        page
          .getByText(
            "Access denied: You do not have permission to access this organization"
          )
          .first()
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanup();
    }
  });
});
