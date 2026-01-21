import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures/auth.fixture"
// import { triggerCommandMenuShortcut } from "./utils/command-menu";

test.describe("documents", () => {
  test("can create a new document", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" })
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "",
    })
  })

  test("can create new document in folder", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" })
    await page.getByRole("button", { name: "Create new folder" }).click()
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" })
    await sidebarTree
      .getByRole("row", { name: "New Folder" })
      .getByRole("button", { name: "Folder options" })
      .click()
    await page.getByRole("menuitem", { name: "Create document in folder" }).click()
    // TODO: better way of figuring out if a document has actually been created?
    const titleEditor = page.getByLabel("Document title").locator('[contenteditable="true"]').first()
    // Verify the editor exists and is empty (new documents start with empty title)
    await expect(titleEditor).toBeVisible()
    await expect(titleEditor).toHaveText("")

    await titleEditor.click()
    await titleEditor.fill("Document in Folder")
    await titleEditor.blur()

    const documentSidebarItem = page.getByRole("row", {
      name: "Document in Folder",
    })
    await expect(documentSidebarItem).toBeVisible()
    // expect to be a descendant of the folder row
    await expect(documentSidebarItem).toHaveAttribute("aria-level", "2")
  })

  test("can update document content", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" })
    const content = "Hello, World!"
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content,
    })

    const contentEditor = page.getByLabel("Document content").locator('[contenteditable="true"]').first()

    // Wait for auto-save (TODO: test this better and allow ctrl+s to work)
    await page.waitForTimeout(1000)

    await page.reload({ waitUntil: "networkidle" })
    await expect(contentEditor).toContainText(content)
  })

  test("can delete a document from sidebar", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" })
    // Set up a document with title and content (setup, not what we're testing)
    await createDocument(page, organization.slug, {
      title: "Document to Delete",
      content: "Some content",
    })
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" })
    const documentSidebarItem = sidebarTree.getByRole("row", {
      name: "Document to Delete",
    })
    await documentSidebarItem.getByRole("button", { name: "Document options" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click()
    // Assert that we are redirected to the home page
    await page.waitForURL(`/w/${organization.slug}`)
    await expect(documentSidebarItem).not.toBeVisible()
  })

  test("can update document title", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" })
    // Set up a document with initial title (setup)
    await createDocument(page, organization.slug, {
      title: "Initial Title",
      content: "Some content",
    })

    // Now test updating the title (this is what we're testing)
    const titleEditor = page.getByLabel("Document title").locator('[contenteditable="true"]').first()
    await titleEditor.click()
    await titleEditor.fill("My new document title")
    await titleEditor.blur()

    // Expect document to have new title in sidebar
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" })
    await expect(sidebarTree.getByRole("row", { name: "My new document title" })).toBeVisible()
  })

  test("can publish document", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`, { waitUntil: "networkidle" })
    // Set up a document with title and content (setup, not what we're testing)
    await createDocument(page, organization.slug, {
      title: "Test Document",
      content: "This is test content",
    })

    // for some reason triggering the command menu with shortcut didn't work
    // here (despite bluring the editor). TODO: figure out why.
    await page.getByRole("button", { name: "Quick Action" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByRole("dialog").getByRole("option", { name: "Publish document" }).click()

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" })
    const documentSidebarItem = sidebarTree.getByRole("row", {
      name: "Test Document",
    })
    await documentSidebarItem.getByRole("button", { name: "Document options" }).click()
    await page.getByRole("menuitem", { name: "Info" }).click()

    const infoDialog = page.getByRole("dialog", { name: "Document Info" })
    const publicationStatusGroup = infoDialog.getByRole("group", {
      name: "Publication Status",
    })
    await expect(publicationStatusGroup).toContainText("Published")
  })
})

async function createDocument(
  page: Page,
  _organizationSlug: string,
  options: { title: string; content: string },
) {
  await page.getByRole("button", { name: "Create new document" }).click()

  const titleEditor = page.getByLabel("Document title").locator('[contenteditable="true"]').first()
  await titleEditor.click()
  await titleEditor.fill(options.title)
  await titleEditor.blur()

  const contentEditor = page.getByLabel("Document content").locator('[contenteditable="true"]').first()
  await contentEditor.fill(options.content)

  // Wait for auto-save
  await page.waitForTimeout(1000)
}
