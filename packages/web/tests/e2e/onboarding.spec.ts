import { expect, test } from "./fixtures/auth.fixture"
import { db, organizationSettingsTable, documentsTable } from "@lydie/database"
import { eq } from "drizzle-orm"
import { triggerCommandMenuShortcut } from "./utils/command-menu"
import {
  getOnboardingStatus,
  updateOnboardingStatus,
  navigateToOnboardingStep,
} from "./utils/onboarding"
import type { OnboardingStatus } from "@lydie/core/onboarding-status"

test.describe("onboarding flow", () => {
  test("should complete full onboarding flow from documents to integrations", async ({
    page,
    organization,
  }) => {
    // Navigate to the onboarding page
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Verify we're on the onboarding page and documents step is shown
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible()

    // Verify checklist items are present
    await expect(page.getByText("Open the command menu")).toBeVisible()
    await expect(page.getByText("Create a document")).toBeVisible()
    await expect(page.getByText("Explore the editor")).toBeVisible()

    // Verify progress bar shows we're on step 1 of 3
    const progressText = page.getByText("1 / 3")
    await expect(progressText).toBeVisible()

    // Navigate to Assistant step
    await page.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()
    await expect(page.getByText("2 / 3")).toBeVisible()

    // Navigate to Integrations step
    await page.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible()
    await expect(page.getByText("3 / 3")).toBeVisible()

    // Complete onboarding
    await page.getByRole("button", { name: "Finish" }).click()

    // Verify we're redirected to the workspace home
    await page.waitForURL(`/w/${organization.slug}`, {
      waitUntil: "networkidle",
    })

    // Verify onboarding is marked as completed in the database
    const onboardingStatus = await getOnboardingStatus(organization.id)
    expect(onboardingStatus).toBeDefined()
    expect(onboardingStatus?.isCompleted).toBe(true)
  })

  test("should allow going back and forth between steps", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Start on Documents step
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible()

    // Go to Assistant
    await page.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()

    // Go back to Documents
    await page.getByRole("button", { name: "Back" }).click()
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible()

    // Go forward again
    await page.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()
  })

  test("should allow skipping onboarding", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Click skip button
    await page.getByRole("button", { name: "Skip intro" }).click()

    // Verify we're redirected to workspace home
    await page.waitForURL(`/w/${organization.slug}`, {
      waitUntil: "networkidle",
    })

    // Verify onboarding is marked as completed
    const onboardingStatus = await getOnboardingStatus(organization.id)
    expect(onboardingStatus?.isCompleted).toBe(true)
  })
})

test.describe("onboarding checklist tracking", () => {
  test("should auto-check 'open command menu' when command menu is opened", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Verify checkbox is not initially checked
    const checkbox = page
      .getByRole("checkbox")
      .filter({ has: page.getByText("Open the command menu") })
    await expect(checkbox).not.toBeChecked()

    // Open command menu
    await triggerCommandMenuShortcut(page)
    await expect(page.getByRole("dialog")).toBeVisible()

    // Close command menu
    await page.keyboard.press("Escape")

    // Wait a moment for the state to update
    await page.waitForTimeout(500)

    // Verify checkbox is now checked
    await expect(checkbox).toBeChecked()

    // Verify this is persisted in the database
    const onboardingStatus = await getOnboardingStatus(organization.id)
    expect(onboardingStatus?.checkedItems).toContain("documents:open-command-menu")
  })

  test("should not allow manually checking checklist items (read-only)", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Get the first checkbox
    const checkbox = page
      .getByRole("checkbox")
      .filter({ has: page.getByText("Open the command menu") })

    // Verify checkbox is not checked initially
    await expect(checkbox).not.toBeChecked()

    // Try to click it (should not work since it's read-only)
    await checkbox.click()
    await page.waitForTimeout(300)

    // Verify it's still not checked
    await expect(checkbox).not.toBeChecked()

    // Verify database state hasn't changed
    const onboardingStatus = await getOnboardingStatus(organization.id)
    expect(onboardingStatus?.checkedItems).not.toContain("documents:open-command-menu")
  })
})

test.describe("demo guide creation", () => {
  test("should create interactive guide and auto-check checklist items", async ({
    page,
    organization,
    user,
  }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Open command menu
    await triggerCommandMenuShortcut(page)
    await expect(page.getByRole("dialog")).toBeVisible()

    // Verify the demo guide option is visible
    await expect(
      page.getByRole("option", { name: /Create Interactive Guide.*Recommended/i }),
    ).toBeVisible()

    // Click the demo guide option
    await page.getByRole("option", { name: /Create Interactive Guide.*Recommended/i }).click()

    // Wait for navigation to the created document
    await page.waitForURL(/\/w\/[\w-]+\/[\w-]+/, {
      waitUntil: "networkidle",
    })

    // Verify we're on the editor page with the guide document
    await expect(page.getByRole("heading", { name: "📚 Editor Guide" })).toBeVisible({
      timeout: 10000,
    })

    // Verify the demo guide was created in the database
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.organizationId, organization.id))
      .where(eq(documentsTable.title, "📚 Editor Guide"))
      .limit(1)

    expect(document).toBeDefined()
    expect(document.customFields).toMatchObject({ isOnboardingGuide: "true" })

    // Verify checklist items were auto-checked
    const onboardingStatus = await getOnboardingStatus(organization.id)
    expect(onboardingStatus?.checkedItems).toContain("documents:create-document")
    expect(onboardingStatus?.checkedItems).toContain("documents:explore-editor")
    expect(onboardingStatus?.createdDemoGuide).toBe(true)

    // Cleanup
    await db.delete(documentsTable).where(eq(documentsTable.id, document.id))
  })

  test("should not show demo guide option after it's been created", async ({ page, organization }) => {
    // First, mark the demo guide as created in the database
    await updateOnboardingStatus(organization.id, {
      createdDemoGuide: true,
    })

    // Navigate to the onboarding page
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Open command menu
    await triggerCommandMenuShortcut(page)
    await expect(page.getByRole("dialog")).toBeVisible()

    // Verify the demo guide option is NOT visible
    await expect(
      page.getByRole("option", { name: /Create Interactive Guide.*Recommended/i }),
    ).not.toBeVisible()

    // Verify regular "Create new document" is still there
    await expect(page.getByRole("option", { name: "Create new document…" })).toBeVisible()
  })
})

test.describe("onboarding state persistence", () => {
  test("should persist current step across page reloads", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Navigate to Assistant step
    await page.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()

    // Reload the page
    await page.reload({ waitUntil: "networkidle" })

    // Verify we're still on the Assistant step
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()
    await expect(page.getByText("2 / 3")).toBeVisible()

    // Verify the database has the correct state
    const onboardingStatus = await getOnboardingStatus(organization.id)
    expect(onboardingStatus?.currentStep).toBe("assistant")
  })

  test("should persist checked items across page reloads", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Check a checkbox
    const checkbox = page
      .getByRole("checkbox")
      .filter({ has: page.getByText("Open the command menu") })
    await checkbox.click()
    await page.waitForTimeout(300)

    // Reload the page
    await page.reload({ waitUntil: "networkidle" })

    // Verify checkbox is still checked
    await expect(checkbox).toBeChecked()
  })

  test("should sync onboarding state across multiple tabs", async ({
    page,
    organization,
    context,
  }) => {
    // First tab - navigate to onboarding
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Open a second tab
    const page2 = await context.newPage()
    await page2.goto(`/w/${organization.slug}/assistant`)
    await page2.waitForLoadState("networkidle")

    // In first tab, go to next step
    await page.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()

    // Wait a moment for Zero to sync
    await page.waitForTimeout(1000)

    // In second tab, reload to see the synced state
    await page2.reload({ waitUntil: "networkidle" })

    // Verify second tab shows the updated step
    await expect(page2.getByRole("heading", { name: "Assistant" })).toBeVisible()

    await page2.close()
  })
})

test.describe("onboarding completion", () => {
  test("should mark onboarding as completed when finishing", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Navigate through all steps
    await page.getByRole("button", { name: "Next" }).click()
    await page.getByRole("button", { name: "Next" }).click()

    // Finish onboarding
    await page.getByRole("button", { name: "Finish" }).click()

    // Verify database state
    const onboardingStatus = await getOnboardingStatus(organization.id)
    expect(onboardingStatus?.isCompleted).toBe(true)
    expect(onboardingStatus?.completedSteps).toEqual(["documents", "assistant", "integrations"])
  })

  test("should not show onboarding after completion", async ({ page, organization }) => {
    // Mark onboarding as completed
    await updateOnboardingStatus(organization.id, {
      isCompleted: true,
      completedSteps: ["documents", "assistant", "integrations"],
    })

    // Navigate to assistant page (where onboarding would normally show)
    await page.goto(`/w/${organization.slug}/assistant`)
    await page.waitForLoadState("networkidle")

    // Verify onboarding is NOT shown
    await expect(page.getByRole("heading", { name: "Documents" })).not.toBeVisible()
    await expect(page.getByText("1 / 3")).not.toBeVisible()

    // Instead, we should see the assistant page
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()
  })
})
