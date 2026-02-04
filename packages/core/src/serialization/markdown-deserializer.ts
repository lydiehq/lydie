export interface MarkdownDeserializeOptions {}

// Deserialize Markdown string to TipTap JSON
export function deserializeFromMarkdown(
  markdown: string,
  options: MarkdownDeserializeOptions = {},
): any {
  const lines = markdown.split("\n");
  const content: any[] = [];
  let currentParagraph: any = null;
  let currentList: any = null;
  let currentListType: "bullet" | "ordered" | null = null;
  let inCodeBlock = false;
  let codeBlockLanguage: string | null = null;
  let codeBlockLines: string[] = [];
  let currentTable: any = null;
  let isHeaderRow = false;

  const closeList = () => {
    if (currentList) {
      content.push(currentList);
      currentList = null;
      currentListType = null;
    }
  };

  const closeParagraph = () => {
    if (currentParagraph) {
      if (currentParagraph.content.length > 0) {
        content.push(currentParagraph);
      }
      currentParagraph = null;
    }
  };

  const closeTable = () => {
    if (currentTable) {
      if (currentTable.content.length > 0) {
        content.push(currentTable);
      }
      currentTable = null;
      isHeaderRow = false;
    }
  };

  const parseTableRow = (line: string): string[] => {
    // Split by | and filter out empty strings at start/end
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    return cells;
  };

  const isTableSeparator = (line: string): boolean => {
    // Check if line is a table separator (e.g., |---|---|)
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      return false;
    }
    // Check if it contains mostly dashes and pipes
    const content = trimmed.slice(1, -1);
    return /^[\s\-:]+$/.test(content);
  };

  const parseInlineMarkdown = (text: string): any[] => {
    const textNodes: any[] = [];
    if (!text) {
      return [{ type: "text", text: "" }];
    }

    // Parse placeholder HTML first: <span data-placeholder data-label="...">...</span>
    const placeholderPattern =
      /<span data-placeholder[^>]*data-label="([^"]*)"[^>]*>([^<]*)<\/span>/g;
    let lastIndex = 0;
    let match;

    while ((match = placeholderPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        textNodes.push(...parseMarkdownLinks(beforeText));
      }

      const label = match[1];
      const innerText = match[2];

      // Create placeholder node with proper structure
      textNodes.push({
        type: "fieldPlaceholder",
        attrs: { label },
        content: [
          {
            type: "text",
            text: innerText || label,
          },
        ],
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      textNodes.push(...parseMarkdownLinks(remainingText));
    }

    return textNodes.length > 0 ? textNodes : [{ type: "text", text: "" }];
  };

  const parseMarkdownLinks = (text: string): any[] => {
    const textNodes: any[] = [];
    if (!text) {
      return [{ type: "text", text: "" }];
    }

    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        textNodes.push(...parseBoldItalic(beforeText));
      }

      textNodes.push({
        type: "text",
        text: match[1],
        marks: [{ type: "link", attrs: { href: match[2] } }],
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      textNodes.push(...parseBoldItalic(remainingText));
    }

    function parseBoldItalic(segment: string): any[] {
      if (!segment) return [];

      const nodes: any[] = [];
      const boldPattern = /\*\*([^*]+)\*\*/g;
      let lastIdx = 0;
      let boldMatch;

      while ((boldMatch = boldPattern.exec(segment)) !== null) {
        if (boldMatch.index > lastIdx) {
          const beforeText = segment.substring(lastIdx, boldMatch.index);
          nodes.push(...parseItalic(beforeText));
        }

        nodes.push({
          type: "text",
          text: boldMatch[1],
          marks: [{ type: "bold" }],
        });

        lastIdx = boldMatch.index + boldMatch[0].length;
      }

      if (lastIdx < segment.length) {
        const remaining = segment.substring(lastIdx);
        nodes.push(...parseItalic(remaining));
      }

      return nodes.length > 0 ? nodes : [{ type: "text", text: segment }];
    }

    function parseItalic(segment: string): any[] {
      if (!segment) return [];

      const nodes: any[] = [];
      const italicPattern = /(?<!\*)\*([^*]+)\*(?!\*)/g;
      let lastIdx = 0;
      let italicMatch;

      while ((italicMatch = italicPattern.exec(segment)) !== null) {
        if (italicMatch.index > lastIdx) {
          nodes.push({
            type: "text",
            text: segment.substring(lastIdx, italicMatch.index),
          });
        }

        nodes.push({
          type: "text",
          text: italicMatch[1],
          marks: [{ type: "italic" }],
        });

        lastIdx = italicMatch.index + italicMatch[0].length;
      }

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
    if (line === undefined) continue;

    const codeBlockStartMatch = line.match(/^```([\w-]+)?$/);
    if (codeBlockStartMatch) {
      if (inCodeBlock) {
        closeParagraph();
        closeList();

        const codeText = codeBlockLines.join("\n");
        content.push({
          type: "codeBlock",
          attrs: codeBlockLanguage ? { language: codeBlockLanguage } : undefined,
          content: codeText
            ? [
                {
                  type: "text",
                  text: codeText,
                },
              ]
            : [],
        });

        inCodeBlock = false;
        codeBlockLanguage = null;
        codeBlockLines = [];
      } else {
        closeParagraph();
        closeList();
        inCodeBlock = true;
        codeBlockLanguage = codeBlockStartMatch[1] || null;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      if (line !== undefined) {
        codeBlockLines.push(line);
      }
      continue;
    }

    if (line && line.trim().startsWith("#")) {
      closeParagraph();
      closeList();

      const match = line.match(/^(#+)\s+(.+)$/);
      if (match && match[1] && match[2]) {
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
      closeTable();
      content.push({
        type: "horizontalRule",
      });
      continue;
    }

    // Handle table separator row
    if (line && isTableSeparator(line)) {
      if (currentTable) {
        // Mark that the next row will be data rows (not header)
        isHeaderRow = false;
      }
      continue;
    }

    // Handle table rows
    if (line && line.trim().startsWith("|") && line.trim().endsWith("|")) {
      closeParagraph();
      closeList();

      const cells = parseTableRow(line);
      if (cells.length === 0) {
        continue;
      }

      if (!currentTable) {
        currentTable = {
          type: "table",
          content: [],
        };
        isHeaderRow = true;
      }

      const rowCells: any[] = [];
      for (const cellText of cells) {
        const cellContent = parseInlineMarkdown(cellText);
        const cellType = isHeaderRow ? "tableHeader" : "tableCell";
        rowCells.push({
          type: cellType,
          content: [
            {
              type: "paragraph",
              content: cellContent.length > 0 ? cellContent : [],
            },
          ],
        });
      }

      currentTable.content.push({
        type: "tableRow",
        content: rowCells,
      });

      continue;
    }

    const unorderedMatch = line?.match(/^(\s*)([-*+])\s+(.+)$/);
    if (unorderedMatch && unorderedMatch[3]) {
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
    const orderedMatch = line?.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch && orderedMatch[2] && orderedMatch[3]) {
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

    if (!line || line.trim() === "") {
      closeParagraph();
      closeList();
      closeTable();
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

  closeParagraph();
  closeList();
  closeTable();

  // Close any remaining code block
  if (inCodeBlock) {
    const codeText = codeBlockLines.join("\n");
    content.push({
      type: "codeBlock",
      attrs: codeBlockLanguage ? { language: codeBlockLanguage } : undefined,
      content: codeText
        ? [
            {
              type: "text",
              text: codeText,
            },
          ]
        : [],
    });
  }

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
