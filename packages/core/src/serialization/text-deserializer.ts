/**
 * Plain text to TipTap JSON deserializer
 * Deserializes plain text strings to TipTap JSON format
 *
 * This deserializer treats plain text as a series of paragraphs,
 * preserving line breaks and basic structure.
 */

export interface TextDeserializeOptions {
  /**
   * Whether to preserve empty paragraphs
   * @default false
   */
  preserveEmptyParagraphs?: boolean;
}

/**
 * Deserialize plain text string to TipTap JSON
 * Each line becomes a paragraph, with empty lines creating paragraph breaks
 */
export function deserializeFromText(
  text: string,
  options: TextDeserializeOptions = {}
): any {
  const { preserveEmptyParagraphs = false } = options;

  const lines = text.split("\n");
  const content: any[] = [];
  let currentParagraph: any = null;

  const closeParagraph = () => {
    if (currentParagraph) {
      // Only add non-empty paragraphs unless preserveEmptyParagraphs is true
      if (
        currentParagraph.content.length > 0 ||
        preserveEmptyParagraphs
      ) {
        content.push(currentParagraph);
      }
      currentParagraph = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle empty lines - close current paragraph
    if (line.trim() === "") {
      closeParagraph();
      continue;
    }

    // Start a new paragraph if needed
    if (!currentParagraph) {
      currentParagraph = {
        type: "paragraph",
        content: [],
      };
    }

    // Add text node for this line
    if (currentParagraph.content.length > 0) {
      // If paragraph already has content, add a line break
      // We'll represent this as a space for now, or we could use a hard break
      currentParagraph.content.push({ type: "text", text: " " });
    }
    currentParagraph.content.push({ type: "text", text: line });
  }

  // Close any remaining open paragraph
  closeParagraph();

  // Ensure we always have at least one content node
  if (content.length === 0) {
    content.push({
      type: "paragraph",
      content: [],
    });
  }

  return {
    type: "doc",
    content,
  };
}

