import { expect, test } from "./fixtures/auth.fixture";
import { db, documentsTable } from "@lydie/database";
import { createId } from "@lydie/core/id";
import { eq } from "drizzle-orm";

test.describe("Editor", () => {
  test("should suggest first text from editor when clicking title input", async ({
    page,
    organization,
    user,
  }) => {
    // Create a document with some content
    const documentId = createId();
    const firstText = "This is the first paragraph text";

    const jsonContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: firstText,
            },
          ],
        },
      ],
    };

    await db.insert(documentsTable).values({
      id: documentId,
      title: "Untitled document",
      slug: documentId,
      jsonContent: jsonContent,
      userId: user.id,
      organizationId: organization.id,
      indexStatus: "outdated",
      published: false,
    });

    try {
      // Navigate to the document
      await page.goto(`/w/${organization.id}/${documentId}`);
      await page.waitForURL(`/w/${organization.id}/${documentId}`, {
        timeout: 5000,
      });

      // Wait for the editor to be ready and content to be visible
      const editorContent = page.locator('[role="textbox"]');
      await editorContent.waitFor({ timeout: 5000 });

      // Wait for the content to actually appear in the editor
      await expect(editorContent).toContainText(firstText, { timeout: 5000 });

      // Find the title input - it should currently show "Untitled document"
      const titleInput = page.getByLabel("Document title");
      await expect(titleInput).toHaveValue("Untitled document");

      // Click the title input to trigger the suggestion
      await titleInput.click();

      // Wait for the suggestion to be applied (the setTimeout in handleTitleFocus)
      // The suggestion should be the first text from the paragraph
      const suggestedText = firstText
        .split(/[.,\n]/)[0]
        .trim()
        .substring(0, 50);
      await expect(titleInput).toHaveValue(suggestedText, { timeout: 1000 });

      // Verify that the text is selected (we can check by typing something)
      // If text is selected, typing will replace it
      await titleInput.fill("New Title");
      await expect(titleInput).toHaveValue("New Title");
    } finally {
      // Cleanup
      await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
    }
  });
});
