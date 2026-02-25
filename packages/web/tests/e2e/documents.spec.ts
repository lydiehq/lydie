import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";

test.describe("documents", () => {
  test("can create a new document", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Test Document", content: "" });
    await expect(
      page.getByRole("treegrid", { name: "Documents" }).getByRole("row", { name: "Test Document" }),
    ).toBeVisible();
  });

  test("can create document inside another document", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Parent Document", content: "" });

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    const parentSidebarItem = sidebarTree.getByRole("row", { name: "Parent Document" });
    await parentSidebarItem.hover();
    await parentSidebarItem.getByRole("button", { name: "Add sub document" }).click();

    const titleEditor = page
      .getByLabel("Document title")
      .locator('[contenteditable="true"]')
      .first();
    await expect(titleEditor).toBeVisible();

    await titleEditor.click();
    await titleEditor.fill("Document in Parent");
    await titleEditor.blur();

    const documentSidebarItem = sidebarTree.getByRole("row", {
      name: "Document in Parent",
    });
    await expect(documentSidebarItem).toBeVisible();
    await expect(documentSidebarItem).toHaveAttribute("aria-level", "2");
  });

  test("can update document content", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    const content = "Hello, World!";
    await createDocument(page, { title: "Test Document", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    await contentEditor.click();
    await contentEditor.fill(content);
    await expect(contentEditor).toContainText(content);
  });

  test("can delete a document from sidebar", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Document to Delete", content: "Some content" });

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    const documentSidebarItem = sidebarTree.getByRole("row", {
      name: "Document to Delete",
    });
    await documentSidebarItem.hover();
    await documentSidebarItem.getByRole("button", { name: "Document options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();

    await page.waitForURL(`/w/${organization.slug}`);
    await expect(documentSidebarItem).not.toBeVisible();
  });

  test("can update document title", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Initial Title", content: "Some content" });

    const titleEditor = page
      .getByLabel("Document title")
      .locator('[contenteditable="true"]')
      .first();
    await titleEditor.click();
    await titleEditor.fill("My new document title");
    await titleEditor.blur();

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    await expect(sidebarTree.getByRole("row", { name: "My new document title" })).toBeVisible();
  });

});
