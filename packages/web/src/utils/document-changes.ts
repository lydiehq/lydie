/**
 * Extract plain text from HTML by stripping tags.
 */
function extractTextFromHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find text position in ProseMirror document and return the position.
 * Returns { from: number, to: number } if found, null otherwise.
 */
function findTextInDocument(
  editor: any,
  searchText: string,
  searchFrom: number = 0,
): { from: number; to: number } | null {
  const normalizedSearch = searchText.toLowerCase().trim();
  if (!normalizedSearch) return null;

  let accumulatedText = "";
  const textNodes: Array<{ text: string; from: number; to: number }> = [];

  // Collect all text nodes with their positions
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      const nodeText = node.text || "";
      textNodes.push({
        text: nodeText,
        from: pos,
        to: pos + nodeText.length,
      });
      accumulatedText += nodeText;
    }
    return true;
  });

  // Find the search text in accumulated content
  const searchIndex = accumulatedText.toLowerCase().indexOf(normalizedSearch, searchFrom);
  if (searchIndex === -1) return null;

  // Map back to document positions
  let currentIndex = 0;
  let startPos: number | null = null;
  let endPos: number | null = null;

  for (const node of textNodes) {
    const nodeStart = currentIndex;
    const nodeEnd = currentIndex + node.text.length;

    // Check if this node contains the start of our match
    if (startPos === null && nodeEnd > searchIndex) {
      startPos = node.from + (searchIndex - nodeStart);
    }

    // Check if this node contains the end of our match
    if (startPos !== null && endPos === null && nodeEnd >= searchIndex + normalizedSearch.length) {
      endPos = node.from + (searchIndex + normalizedSearch.length - nodeStart);
      break;
    }

    currentIndex = nodeEnd;
  }

  if (startPos !== null && endPos !== null) {
    return { from: startPos, to: endPos };
  }

  return null;
}

/**
 * Find a range in the document matching the pattern "startText...endText".
 * Returns { from: number, to: number } for the range to replace.
 */
function findRangeInDocument(editor: any, pattern: string): { from: number; to: number } | null {
  // Handle append pattern: "...endText"
  if (pattern.startsWith("...")) {
    const endText = extractTextFromHTML(pattern.substring(3));
    if (!endText) return null;

    // Find the end text - for append, we want to find the last occurrence
    const result = findTextInDocument(editor, endText);
    if (!result) return null;

    // For append, we replace from the start of the found text to its end
    // The replacement should include the anchor text + new content
    return { from: result.from, to: result.to };
  }

  // Handle prepend pattern: "startText..."
  if (pattern.endsWith("...")) {
    const startText = extractTextFromHTML(pattern.substring(0, pattern.length - 3));
    if (!startText) return null;

    // Find the start text - for prepend, we want the first occurrence
    const result = findTextInDocument(editor, startText);
    if (!result) return null;

    // For prepend, we replace from the start to the end of the found text
    return { from: result.from, to: result.to };
  }

  // Handle range pattern: "startText...endText"
  const ellipsisIndex = pattern.indexOf("...");
  if (ellipsisIndex === -1) return null;

  const startPattern = pattern.substring(0, ellipsisIndex).trim();
  const endPattern = pattern.substring(ellipsisIndex + 3).trim();

  const startText = extractTextFromHTML(startPattern);
  const endText = endPattern ? extractTextFromHTML(endPattern) : "";

  if (!startText) return null;

  // Find the start position
  const startResult = findTextInDocument(editor, startText);
  if (!startResult) return null;

  // If no end pattern, replace from start to end of document
  if (!endText) {
    return { from: startResult.from, to: editor.state.doc.content.size };
  }

  // Find the end position, starting search after the start text
  const endResult = findTextInDocument(editor, endText, startResult.to);
  if (!endResult) return null;

  // Return the full range from start of startText to end of endText
  return { from: startResult.from, to: endResult.to };
}

/**
 * Get the current scroll position of the editor container.
 */
function getEditorScrollPosition(editor: any): { scrollTop: number; scrollLeft: number } | null {
  try {
    const dom = editor.view.dom as HTMLElement;
    const scrollContainer = dom.closest("[data-editor-scroll-container]") || dom.parentElement;
    if (scrollContainer) {
      return {
        scrollTop: scrollContainer.scrollTop,
        scrollLeft: scrollContainer.scrollLeft,
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Restore the scroll position of the editor container.
 */
function restoreEditorScrollPosition(
  editor: any,
  position: { scrollTop: number; scrollLeft: number } | null,
): void {
  if (!position) return;
  try {
    const dom = editor.view.dom as HTMLElement;
    const scrollContainer = dom.closest("[data-editor-scroll-container]") || dom.parentElement;
    if (scrollContainer) {
      scrollContainer.scrollTop = position.scrollTop;
      scrollContainer.scrollLeft = position.scrollLeft;
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Apply a replacement using collaborative-friendly commands.
 * This properly integrates with Yjs and maintains undo history.
 */
function applyCollaborativeChange(editor: any, pattern: string, replacement: string): boolean {
  // Save scroll position before making changes
  const scrollPosition = getEditorScrollPosition(editor);

  // Full document replacement
  if (!pattern) {
    if (editor.isEmpty) {
      editor.commands.setContent(replacement);
      restoreEditorScrollPosition(editor, scrollPosition);
      return true;
    }

    // Use selectAll + deleteSelection + insertContent for Yjs tracking
    try {
      editor.chain().selectAll().deleteSelection().insertContent(replacement).run();
      restoreEditorScrollPosition(editor, scrollPosition);
      return true;
    } catch (error) {
      console.error("Failed to apply full document replacement:", error);
      return false;
    }
  }

  // Find the range in the document
  const range = findRangeInDocument(editor, pattern);
  if (!range) {
    console.warn("Could not find pattern in document:", pattern);
    return false;
  }

  // Use collaborative-friendly commands: deleteRange + insertContentAt
  // Note: We don't call .focus() to avoid scrolling to the cursor position
  try {
    editor
      .chain()
      .deleteRange({ from: range.from, to: range.to })
      .insertContentAt(range.from, replacement)
      .run();
    restoreEditorScrollPosition(editor, scrollPosition);
    return true;
  } catch (error) {
    console.error("Failed to apply collaborative change:", error);
    return false;
  }
}

function applyChange(editor: any, pattern: string, replacement: string): boolean {
  // Use collaborative-friendly approach that maintains Yjs integration
  return applyCollaborativeChange(editor, pattern, replacement);
}

async function llmFallback(
  editor: any,
  pattern: string,
  replacement: string,
  organizationId: string,
): Promise<boolean> {
  try {
    const currentHTML = editor.getHTML();

    const response = await fetch(
      import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/llm-replace",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Organization-Id": organizationId,
        },
        body: JSON.stringify({
          currentHTML,
          selectionWithEllipsis: pattern,
          replaceText: replacement,
        }),
      },
    );

    if (!response.ok) return false;

    const result = await response.json();
    if (!result.success || !result.exactMatch) return false;

    // Find the exact match text in the document
    const matchText = extractTextFromHTML(result.exactMatch);
    const range = findTextInDocument(editor, matchText);

    if (range) {
      // Save scroll position before making changes
      const scrollPosition = getEditorScrollPosition(editor);
      // Use collaborative-friendly commands (without .focus() to preserve scroll position)
      editor
        .chain()
        .deleteRange({ from: range.from, to: range.to })
        .insertContentAt(range.from, replacement)
        .run();
      restoreEditorScrollPosition(editor, scrollPosition);
      return true;
    }

    // Fallback: if we can't find the text directly, create a pattern and try collaborative approach
    const textContent = extractTextFromHTML(result.exactMatch);
    if (textContent.length > 20) {
      const startPart = textContent.substring(0, Math.min(30, textContent.length));
      const endPart = textContent.substring(Math.max(0, textContent.length - 30));
      const fallbackPattern = `${startPart}...${endPart}`;
      return applyCollaborativeChange(editor, fallbackPattern, replacement);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Find the document range for a given pattern without applying changes.
 * Returns the range { from, to } and the current content HTML at that range.
 * This is used for diff visualization to show what will be changed.
 */
export function findChangeRange(
  editor: any,
  pattern: string,
): {
  from: number;
  to: number;
  currentHTML: string;
  success: boolean;
  error?: string;
} {
  // Full document replacement
  if (!pattern) {
    return {
      from: 0,
      to: editor.state.doc.content.size,
      currentHTML: editor.getHTML(),
      success: true,
    };
  }

  // Find the range in the document
  const range = findRangeInDocument(editor, pattern);
  if (!range) {
    return {
      from: 0,
      to: 0,
      currentHTML: "",
      success: false,
      error: "Could not find the specified text in the document",
    };
  }

  // Extract the current HTML content at this range
  try {
    const fragment = editor.state.doc.slice(range.from, range.to).content;
    const tempDoc = editor.state.doc.type.create(null, fragment);
    const currentHTML = editor.schema.serializers?.DOM?.serializeFragment
      ? editor.schema.serializers.DOM.serializeFragment(tempDoc.content, { document })
      : "";

    // Simple fallback: get text content and wrap in span
    const serializer =
      editor.view.domSerializer || editor.schema?.DOMSerializer?.fromSchema(editor.schema);
    let html = "";
    if (serializer) {
      const domFragment = serializer.serializeFragment(fragment);
      const tempDiv = document.createElement("div");
      tempDiv.appendChild(domFragment);
      html = tempDiv.innerHTML;
    }

    return {
      from: range.from,
      to: range.to,
      currentHTML: html || currentHTML,
      success: true,
    };
  } catch (error) {
    return {
      from: range.from,
      to: range.to,
      currentHTML: "",
      success: true,
    };
  }
}

export async function applyContentChanges(
  editor: any,
  changes: Array<{ selectionWithEllipsis: string; replace: string }>,
  organizationId: string,
  onProgress?: (current: number, total: number, usingLLM: boolean) => void,
  onLLMStateChange?: (usingLLM: boolean) => void,
): Promise<{
  success: boolean;
  error?: string;
  appliedChanges: number;
  usedLLMFallback?: boolean;
}> {
  let appliedChanges = 0;
  let usedLLMFallback = false;

  // Save scroll position at the start
  const initialScrollPosition = getEditorScrollPosition(editor);

  for (const change of changes) {
    const { selectionWithEllipsis, replace } = change;

    if (!selectionWithEllipsis) {
      // Full document replacement - use collaborative-friendly approach
      const success = applyCollaborativeChange(editor, "", replace);
      if (success) {
        appliedChanges++;
        onProgress?.(appliedChanges, changes.length, false);
      }
      continue;
    }

    if (applyChange(editor, selectionWithEllipsis, replace)) {
      appliedChanges++;
      onProgress?.(appliedChanges, changes.length, false);
      continue;
    }

    onLLMStateChange?.(true);
    onProgress?.(appliedChanges, changes.length, true);

    const llmSuccess = await llmFallback(editor, selectionWithEllipsis, replace, organizationId);
    onLLMStateChange?.(false);

    if (llmSuccess) {
      appliedChanges++;
      usedLLMFallback = true;
      onProgress?.(appliedChanges, changes.length, false);
    }
  }

  // Restore scroll position after all changes are applied
  restoreEditorScrollPosition(editor, initialScrollPosition);

  return {
    success: appliedChanges > 0,
    appliedChanges,
    usedLLMFallback,
  };
}
