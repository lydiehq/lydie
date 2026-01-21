import { expect, test } from "./fixtures/auth.fixture"
import { createTestUser, createTestOrganization } from "./utils/db"
import { db, organizationsTable } from "@lydie/database"
import { eq } from "drizzle-orm"

test.describe("workspace management", () => {
  test("should be able to create a new workspace through organization menu", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" })

    await page.getByRole("button", { name: organization.name }).first().click()

    await page.getByRole("menuitem", { name: "Switch workspace" }).click()

    await expect(page.getByRole("heading", { name: "My workspaces" })).toBeVisible()

    await page.getByRole("link", { name: "Create workspace" }).click()
    await page.waitForURL("/onboarding")

    await expect(page.getByRole("heading", { name: "Welcome to Lydie" })).toBeVisible()

    const newWorkspaceName = `New Workspace ${Date.now()}`
    await page.getByLabel("Workspace Name").fill(newWorkspaceName)

    await page.getByRole("button", { name: "Create Workspace" }).click()

    await page.waitForURL(/\/w\/[\w-]+/)

    await expect(page.getByRole("button", { name: newWorkspaceName }).first()).toBeVisible()
  })

  test("should be able to switch between workspaces", async ({ page, organization, user }) => {
    const secondWorkspaceName = `Second Test Workspace ${Date.now()}`
    const secondWorkspace = await createTestOrganization(user.id, {
      prefix: "second-workspace",
      name: secondWorkspaceName,
      slug: `second-workspace-${user.id}-${Date.now()}`,
    })

    try {
      await page.goto(`/w/${organization.slug}`)
      await page.waitForURL(`/w/${organization.slug}`)

      await page.getByRole("button", { name: organization.name }).first().click()

      await page.getByRole("menuitem", { name: "Switch workspace" }).click()

      await expect(page.getByRole("heading", { name: "My workspaces" })).toBeVisible()

      await expect(page.getByText(organization.name)).toBeVisible()
      await expect(page.getByText(secondWorkspaceName)).toBeVisible()

      await page.getByRole("button").filter({ hasText: secondWorkspaceName }).click()

      await page.waitForURL(`/w/${secondWorkspace.slug}`)

      await expect(page.getByRole("button", { name: secondWorkspaceName }).first()).toBeVisible()
    } finally {
      await db.delete(organizationsTable).where(eq(organizationsTable.id, secondWorkspace.id))
    }
  })
})

test.describe("workspace access isolation", () => {
  test("should not allow access to workspace route of another workspace", async ({ page }) => {
    const { organization, cleanup } = await createTestUser({
      prefix: "other",
    })

    try {
      await page.goto(`/w/${organization.slug}`)
      await expect(
        page.getByText("Access denied: You do not have permission to access this workspace").first(),
      ).toBeVisible()
    } finally {
      await cleanup()
    }
  })
})
