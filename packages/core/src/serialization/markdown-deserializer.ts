export interface MarkdownDeserializeOptions {
  // Whether to preserve empty paragraphs
  preserveEmptyParagraphs?: boolean;
}

/**
 * Deserialize Markdown string to TipTap JSON
 */
export function deserializeFromMarkdown(
  markdown: string,
  options: MarkdownDeserializeOptions = {}
): any {
  const lines = markdown.split("\n");
  const content: any[] = [];
  let currentParagraph: any = null;
  let currentList: any = null;
  let currentListType: "bullet" | "ordered" | null = null;

  const closeList = () => {
    if (currentList) {
      content.push(currentList);
      currentList = null;
      currentListType = null;
    }
  };

  const closeParagraph = () => {
    if (currentParagraph) {
      // Only add non-empty paragraphs unless preserveEmptyParagraphs is true
      if (
        currentParagraph.content.length > 0 ||
        options.preserveEmptyParagraphs
      ) {
        content.push(currentParagraph);
      }
      currentParagraph = null;
    }
  };

  const parseInlineMarkdown = (text: string): any[] => {
    const textNodes: any[] = [];
    if (!text) {
      return [{ type: "text", text: "" }];
    }

    // Simple approach: split by patterns and process sequentially
    // Priority: links > bold > italic
    // Split by links first, then process each segment for bold/italic
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkPattern.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        textNodes.push(...parseBoldItalic(beforeText));
      }

      // Add the link
      textNodes.push({
        type: "text",
        text: match[1],
        marks: [{ type: "link", attrs: { href: match[2] } }],
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last link
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      textNodes.push(...parseBoldItalic(remainingText));
    }

    // Helper to parse bold and italic (bold takes priority)
    function parseBoldItalic(segment: string): any[] {
      if (!segment) return [];

      const nodes: any[] = [];
      const boldPattern = /\*\*([^*]+)\*\*/g;
      let lastIdx = 0;
      let boldMatch;

      while ((boldMatch = boldPattern.exec(segment)) !== null) {
        // Add text before bold
        if (boldMatch.index > lastIdx) {
          const beforeText = segment.substring(lastIdx, boldMatch.index);
          nodes.push(...parseItalic(beforeText));
        }

        // Add bold text
        nodes.push({
          type: "text",
          text: boldMatch[1],
          marks: [{ type: "bold" }],
        });

        lastIdx = boldMatch.index + boldMatch[0].length;
      }

      // Add remaining text
      if (lastIdx < segment.length) {
        const remaining = segment.substring(lastIdx);
        nodes.push(...parseItalic(remaining));
      }

      return nodes.length > 0 ? nodes : [{ type: "text", text: segment }];
    }

    // Helper to parse italic
    function parseItalic(segment: string): any[] {
      if (!segment) return [];

      const nodes: any[] = [];
      const italicPattern = /(?<!\*)\*([^*]+)\*(?!\*)/g;
      let lastIdx = 0;
      let italicMatch;

      while ((italicMatch = italicPattern.exec(segment)) !== null) {
        // Add text before italic
        if (italicMatch.index > lastIdx) {
          nodes.push({
            type: "text",
            text: segment.substring(lastIdx, italicMatch.index),
          });
        }

        // Add italic text
        nodes.push({
          type: "text",
          text: italicMatch[1],
          marks: [{ type: "italic" }],
        });

        lastIdx = italicMatch.index + italicMatch[0].length;
      }

      // Add remaining text
      if (lastIdx < segment.length) {
        nodes.push({
          type: "text",
          text: segment.substring(lastIdx),
        });
      }

      return nodes.length > 0 ? nodes : [{ type: "text", text: segment }];
    }

    return textNodes.length > 0 ? textNodes : [{ type: "text", text: "" }];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle headings (# ## ###)
    if (line.trim().startsWith("#")) {
      closeParagraph();
      closeList();

      const match = line.match(/^(#+)\s+(.+)$/);
      if (match) {
        const level = Math.min(match[1].length, 6);
        const text = match[2];
        content.push({
          type: "heading",
          attrs: { level },
          content: text ? parseInlineMarkdown(text) : [],
        });
      }
      continue;
    }

    // Handle horizontal rules (---)
    if (line.trim() === "---" || line.trim() === "***") {
      closeParagraph();
      closeList();
      content.push({
        type: "horizontalRule",
      });
      continue;
    }

    // Handle unordered lists (-, *, +)
    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (unorderedMatch) {
      closeParagraph();

      const listItemText = unorderedMatch[3];
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      };

      if (currentListType !== "bullet") {
        closeList();
        currentList = {
          type: "bulletList",
          content: [],
        };
        currentListType = "bullet";
      }

      currentList.content.push(listItem);
      continue;
    }

    // Handle ordered lists (1., 2., etc.)
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      closeParagraph();

      const listItemText = orderedMatch[3];
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      };

      if (currentListType !== "ordered") {
        closeList();
        const startNum = parseInt(orderedMatch[2]);
        currentList = {
          type: "orderedList",
          attrs: { start: startNum },
          content: [],
        };
        currentListType = "ordered";
      }

      currentList.content.push(listItem);
      continue;
    }

    // Handle empty lines
    if (line.trim() === "") {
      closeParagraph();
      closeList();
      continue;
    }

    // Handle regular text
    closeList();

    if (!currentParagraph) {
      currentParagraph = {
        type: "paragraph",
        content: [],
      };
    }

    const textNodes = parseInlineMarkdown(line);
    currentParagraph.content.push(...textNodes);
  }

  // Close any remaining open elements
  closeParagraph();
  closeList();

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
