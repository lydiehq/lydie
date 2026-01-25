import type { Editor } from "@tiptap/react";

import { mutators } from "@lydie/zero/mutators";

// Apply title change to the document
export async function applyTitleChange(
  titleEditor: Editor,
  newTitle: string,
  documentId: string,
  organizationId: string,
  z: any, // Use any to avoid complex type constraints with Zero
): Promise<{ success: boolean; error?: string }> {
  try {
    titleEditor.commands.setContent(newTitle);

    await z.mutate(
      mutators.document.update({
        documentId,
        title: newTitle.trim(),
        organizationId,
      }),
    );

    return { success: true };
  } catch (error) {
    console.error("Failed to apply title change:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
