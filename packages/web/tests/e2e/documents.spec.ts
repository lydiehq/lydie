import type { Page } from "@playwright/test";

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

  test("can create new document in folder", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await page.getByRole("button", { name: "Create new folder" }).click();
    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    await sidebarTree
      .getByRole("row", { name: "New Folder" })
      .getByRole("button", { name: "Folder options" })
      .click();
    await page.getByRole("menuitem", { name: "Create document in folder" }).click();

    const titleEditor = page
      .getByLabel("Document title")
      .locator('[contenteditable="true"]')
      .first();
    await expect(titleEditor).toBeVisible();

    await titleEditor.click();
    await titleEditor.fill("Document in Folder");
    await titleEditor.blur();

    const documentSidebarItem = page.getByRole("row", {
      name: "Document in Folder",
    });
    await expect(documentSidebarItem).toBeVisible();
    await expect(documentSidebarItem).toHaveAttribute("aria-level", "2");
  });

  test("can update document content", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    const content = "Hello, World!";
    await createDocument(page, { title: "Test Document", content });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    await page.reload();
    await waitForWorkspace(page);
    await expect(contentEditor).toContainText(content);
  });

  test("can delete a document from sidebar", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Document to Delete", content: "Some content" });

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    const documentSidebarItem = sidebarTree.getByRole("row", {
      name: "Document to Delete",
    });
    await documentSidebarItem.getByRole("button", { name: "Document options" }).click();
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

  test("can publish document", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Test Document", content: "This is test content" });

    await page.getByRole("button", { name: "Quick Action" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("option", { name: "Publish document" }).click();

    const sidebarTree = page.getByRole("treegrid", { name: "Documents" });
    const documentSidebarItem = sidebarTree.getByRole("row", {
      name: "Test Document",
    });
    await documentSidebarItem.getByRole("button", { name: "Document options" }).click();
    await page.getByRole("menuitem", { name: "Info" }).click();

    const infoDialog = page.getByRole("dialog", { name: "Document Info" });
    const publicationStatusGroup = infoDialog.getByRole("group", {
      name: "Publication Status",
    });
    await expect(publicationStatusGroup).toContainText("Published");
  });
});

async function waitForWorkspace(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Quick Action" }).waitFor({ state: "visible" });
}
