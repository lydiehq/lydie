import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth.fixture";
import { createDocument, gotoWorkspace } from "./utils/document";

test.describe("editor", () => {
  test("displays word count and updates correctly", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Word Count Test", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    await expect(page.getByText("Words: 0")).toBeVisible();

    await contentEditor.fill("Hello world");
    await page.waitForTimeout(200);

    await expect(page.getByText("Words: 2")).toBeVisible();

    await contentEditor.press("End");
    await contentEditor.pressSequentially(" this is a test", { delay: 30 });
    await page.waitForTimeout(200);

    await expect(page.getByText(/Words: \d+/)).toBeVisible();
  });

  test("can apply text formatting via bubble menu", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Formatting Test", content: "" });

    const contentEditor = getContentEditor(page);

    // Test bold
    await contentEditor.fill("Bold text");
    await selectAll(page);
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(contentEditor.locator("strong")).toContainText("Bold text");

    // Test italic
    await contentEditor.fill("Italic text");
    await selectAll(page);
    await page.getByRole("button", { name: "Italic" }).click();
    await expect(contentEditor.locator("em")).toContainText("Italic text");

    // Test strikethrough
    await contentEditor.fill("Strikethrough text");
    await selectAll(page);
    await page.getByRole("button", { name: "Strike" }).click();
    await expect(contentEditor.locator("s")).toContainText("Strikethrough text");

    // Test inline code
    await contentEditor.fill("Code text");
    await selectAll(page);
    await page.getByRole("button", { name: "Code" }).click();
    await expect(contentEditor.locator("code")).toContainText("Code text");
  });

  test("can apply heading formatting via slash menu", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Heading Test", content: "" });

    const contentEditor = getContentEditor(page);

    // Heading 1
    await contentEditor.click();
    await contentEditor.fill("/heading");
    await page.getByRole("button", { name: "Heading 1" }).click();
    await contentEditor.fill("Heading 1 text");
    await expect(contentEditor.locator("h1")).toContainText("Heading 1 text");

    // Heading 2
    await contentEditor.press("Enter");
    await contentEditor.fill("/heading");
    await page.getByRole("button", { name: "Heading 2" }).click();
    await contentEditor.fill("Heading 2 text");
    await expect(contentEditor.locator("h2")).toContainText("Heading 2 text");
  });

  test("can insert tables via slash menu", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Table Test", content: "" });

    const contentEditor = getContentEditor(page);

    // Insert table
    await contentEditor.click();
    await contentEditor.fill("/table");
    await page.getByRole("tooltip").getByRole("button", { name: "Table" }).click();
    await page.waitForTimeout(300);

    const table = page.getByLabel("Document content").locator("table");
    await expect(table).toBeVisible();

    const headerRow = table.locator("tbody tr").first();
    await expect(headerRow).toBeVisible();

    const rows = table.locator("tr");
    await expect(rows).toHaveCount(3);

    const firstRowCells = table.locator("tr").first().locator("th, td");
    await expect(firstRowCells).toHaveCount(3);
  });

  test("does not render legacy table toolbar buttons", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "No Legacy Toolbar Test", content: "" });

    await expect(page.getByRole("button", { name: "Table Columns" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Table Rows" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Merge Cells" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Split Cell" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete Table" })).toHaveCount(0);
  });

  test.skip("can insert and display images", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Image Test", content: "" });

    const contentEditor = getContentEditor(page);

    // Mock the image upload API response
    await page.route("**/internal/images/upload-url", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uploadUrl: "https://s3.amazonaws.com/test-bucket/test-image.png?presigned",
          key: "test-key/test-image.png",
          url: "https://test-bucket.s3.amazonaws.com/test-image.png",
        }),
      });
    });

    // Mock the S3 upload
    await page.route("**/test-bucket/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from("fake-image-data"),
      });
    });

    // Insert image directly via editor
    await contentEditor.click();
    await page.evaluate(
      ({ src, alt }) => {
        const editorElement = document.querySelector(
          '[aria-label="Document content"] [contenteditable="true"]',
        ) as HTMLElement;
        if (editorElement) {
          const img = document.createElement("img");
          img.src = src;
          img.alt = alt;
          editorElement.appendChild(img);
        }
      },
      { src: "https://via.placeholder.com/150", alt: "Test alt text" },
    );

    await page.waitForTimeout(200);

    const image = contentEditor.locator("img[alt='Test alt text']");
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", "https://via.placeholder.com/150");
  });
});

function getContentEditor(page: Page) {
  return page.getByLabel("Document content").locator('[contenteditable="true"]').first();
}

async function selectAll(page: Page) {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+a`);
}
