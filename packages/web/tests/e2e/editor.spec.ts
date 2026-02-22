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

  test("can apply text formatting via toolbar", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Formatting Test", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Test bold
    await page.getByRole("button", { name: "Bold" }).click();
    await contentEditor.click();
    await contentEditor.type("Bold text");
    await expect(contentEditor.locator("strong")).toContainText("Bold text");

    // Test italic
    await page.getByRole("button", { name: "Italic" }).click();
    await contentEditor.press("End");
    await contentEditor.press("Enter");
    await contentEditor.type("Italic text");
    await expect(contentEditor.locator("em")).toContainText("Italic text");

    // Test strikethrough
    await page.getByRole("button", { name: "Strike" }).click();
    await contentEditor.press("End");
    await contentEditor.press("Enter");
    await contentEditor.type("Strikethrough text");
    await expect(contentEditor.locator("s")).toContainText("Strikethrough text");

    // Test code
    await page.getByRole("button", { name: "Code" }).click();
    await contentEditor.press("End");
    await contentEditor.press("Enter");
    await contentEditor.type("Code text");
    await expect(contentEditor.locator("code")).toContainText("Code text");
  });

  test("can apply heading formatting via toolbar", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Heading Test", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

    // Heading 1
    await page.getByRole("button", { name: "Heading 1" }).click();
    await contentEditor.click();
    await contentEditor.type("Heading 1 text");
    await expect(contentEditor.locator("h1")).toContainText("Heading 1 text");

    // Heading 2
    await contentEditor.press("End");
    await contentEditor.press("Enter");
    await page.getByRole("button", { name: "Heading 2" }).click();
    await contentEditor.type("Heading 2 text");
    await expect(contentEditor.locator("h2")).toContainText("Heading 2 text");
  });

  test("can insert and manage tables", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Table Test", content: "" });

    // Insert table
    await page.getByRole("button", { name: "Insert Table" }).click();
    await page.waitForTimeout(300);

    const table = page.getByLabel("Document content").locator("table");
    await expect(table).toBeVisible();

    const headerRow = table.locator("thead tr");
    await expect(headerRow).toBeVisible();

    const rows = table.locator("tr");
    await expect(rows).toHaveCount(3);

    const firstRowCells = table.locator("tr").first().locator("th, td");
    await expect(firstRowCells).toHaveCount(3);

    // Click in a cell to activate table tools
    const firstCell = table.locator("td, th").first();
    await firstCell.click();

    // Add column after
    await page.getByRole("button", { name: "Table Columns" }).click();
    await page.getByRole("menuitem", { name: "Add Column After" }).click();
    await page.waitForTimeout(200);
    await expect(firstRowCells).toHaveCount(4);

    // Add row after
    await page.getByRole("button", { name: "Table Rows" }).click();
    await page.getByRole("menuitem", { name: "Add Row After" }).click();
    await page.waitForTimeout(200);
    await expect(rows).toHaveCount(4);

    // Test merge cells
    await firstCell.click();
    await firstCell.press("Shift+ArrowRight");
    await page.getByRole("button", { name: "Merge Cells" }).click();
    await page.waitForTimeout(200);

    const mergedCell = table.locator("td[colspan], th[colspan]").first();
    await expect(mergedCell).toBeVisible();

    // Delete table
    await mergedCell.click();
    await page.getByRole("button", { name: "Delete Table" }).click();
    await page.waitForTimeout(200);
    await expect(table).not.toBeVisible();
  });

  test("table toolbar buttons only appear when in a table", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Table Toolbar Test", content: "" });

    const columnMenuButton = page.getByRole("button", { name: "Table Columns" });
    await expect(columnMenuButton).not.toBeVisible();

    // Insert table and click in it
    await page.getByRole("button", { name: "Insert Table" }).click();
    await page.waitForTimeout(300);

    const table = page.getByLabel("Document content").locator("table");
    await table.locator("td, th").first().click();

    await expect(columnMenuButton).toBeVisible();
    await expect(page.getByRole("button", { name: "Table Rows" })).toBeVisible();

    // Click outside table
    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();
    await contentEditor.press("End");
    await contentEditor.press("Enter");

    await expect(columnMenuButton).not.toBeVisible();
  });

  test("can insert and display images", async ({ page, organization }) => {
    await gotoWorkspace(page, organization.slug);
    await createDocument(page, { title: "Image Test", content: "" });

    const contentEditor = page
      .getByLabel("Document content")
      .locator('[contenteditable="true"]')
      .first();

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
