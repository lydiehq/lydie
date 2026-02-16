function normalizeHTML(html: string): string {
  return html
    .replace(/<(\w+)[^>]*>/g, "<$1>")
    .replace(/<li><p><a>/g, "<li><a>")
    .replace(/<\/a><\/p><\/li>/g, "</a></li>")
    .replace(/<p><a>/g, "<a>")
    .replace(/<\/a><\/p>/g, "</a>")
    .replace(/\s+/g, " ")
    .trim();
}

function mapNormalizedToOriginal(
  originalHTML: string,
  _normalizedHTML: string,
  normalizedIndex: number,
): number {
  let originalIndex = 0;
  let normalizedCounter = 0;

  while (originalIndex < originalHTML.length && normalizedCounter < normalizedIndex) {
    const char = originalHTML[originalIndex];

    if (char === "<") {
      const tagEnd = originalHTML.indexOf(">", originalIndex);
      if (tagEnd !== -1) {
        const tagContent = originalHTML.substring(originalIndex + 1, tagEnd);
        const tagName = tagContent.split(/\s/)[0];
        normalizedCounter += 2 + tagName.length;
        originalIndex = tagEnd + 1;
        continue;
      }
    }

    if (/\s/.test(char)) {
      normalizedCounter++;
      while (originalIndex + 1 < originalHTML.length && /\s/.test(originalHTML[originalIndex + 1])) {
        originalIndex++;
      }
      originalIndex++;
      continue;
    }

    normalizedCounter++;
    originalIndex++;
  }

  return originalIndex;
}

function parseEllipsisPattern(
  currentHTML: string,
  pattern: string,
): { startIndex: number; endIndex: number } | null {
  if (!pattern) {
    return { startIndex: 0, endIndex: currentHTML.length };
  }

  // Append pattern: "...end"
  if (pattern.startsWith("...")) {
    const endPattern = pattern.substring(3).trim();
    if (!endPattern) return null;

    const endIndex = currentHTML.lastIndexOf(endPattern);
    if (endIndex !== -1) {
      return { startIndex: endIndex, endIndex: endIndex + endPattern.length };
    }

    const normalizedCurrent = normalizeHTML(currentHTML);
    const normalizedEnd = normalizeHTML(endPattern);
    const normalizedIndex = normalizedCurrent.lastIndexOf(normalizedEnd);
    if (normalizedIndex !== -1) {
      const actualEndIndex = mapNormalizedToOriginal(currentHTML, normalizedCurrent, normalizedIndex);
      return { startIndex: actualEndIndex, endIndex: actualEndIndex + endPattern.length };
    }
    return null;
  }

  // Prepend pattern: "start..."
  if (pattern.endsWith("...")) {
    const startPattern = pattern.substring(0, pattern.length - 3).trim();
    if (!startPattern) return null;

    const startIndex = currentHTML.indexOf(startPattern);
    if (startIndex !== -1) {
      return { startIndex, endIndex: startIndex + startPattern.length };
    }

    const normalizedCurrent = normalizeHTML(currentHTML);
    const normalizedStart = normalizeHTML(startPattern);
    const normalizedIndex = normalizedCurrent.indexOf(normalizedStart);
    if (normalizedIndex !== -1) {
      const actualStartIndex = mapNormalizedToOriginal(currentHTML, normalizedCurrent, normalizedIndex);
      return { startIndex: actualStartIndex, endIndex: actualStartIndex + startPattern.length };
    }
    return null;
  }

  // Range pattern: "start...end"
  const ellipsisIndex = pattern.indexOf("...");
  if (ellipsisIndex === -1) return null;

  const startPattern = pattern.substring(0, ellipsisIndex).trim();
  const endPattern = pattern.substring(ellipsisIndex + 3).trim();

  let startIndex = currentHTML.indexOf(startPattern);
  if (startIndex === -1) {
    const normalizedCurrent = normalizeHTML(currentHTML);
    const normalizedStart = normalizeHTML(startPattern);
    const normalizedIdx = normalizedCurrent.indexOf(normalizedStart);
    if (normalizedIdx === -1) return null;
    startIndex = mapNormalizedToOriginal(currentHTML, normalizedCurrent, normalizedIdx);
  }

  let endIndex = -1;
  if (endPattern) {
    const searchFrom = startIndex + startPattern.length;
    endIndex = currentHTML.indexOf(endPattern, searchFrom);

    if (endIndex === -1) {
      const normalizedCurrent = normalizeHTML(currentHTML);
      const normalizedEnd = normalizeHTML(endPattern);
      const normalizedStartIdx = normalizeHTML(currentHTML.substring(0, searchFrom)).length;
      const normalizedSearchArea = normalizedCurrent.substring(normalizedStartIdx);
      const normalizedEndIdx = normalizedSearchArea.indexOf(normalizedEnd);

      if (normalizedEndIdx === -1) return null;
      endIndex = mapNormalizedToOriginal(currentHTML, normalizedCurrent, normalizedStartIdx + normalizedEndIdx);
    }
    endIndex += endPattern.length;
  } else {
    endIndex = currentHTML.length;
  }

  if (endIndex < startIndex) return null;
  return { startIndex, endIndex };
}

function applyChange(editor: any, pattern: string, replacement: string): boolean {
  const currentHTML = editor.getHTML();

  if (!pattern && !editor.isEmpty) {
    console.warn("Cannot use empty pattern on non-empty document");
    return false;
  }

  const range = parseEllipsisPattern(currentHTML, pattern);
  if (!range) return false;

  const before = currentHTML.substring(0, range.startIndex);
  const after = currentHTML.substring(range.endIndex);
  const newHTML = before + replacement + after;

  editor.commands.setContent(newHTML);
  return true;
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
        body: JSON.stringify({ currentHTML, selectionWithEllipsis: pattern, replaceText: replacement }),
      }
    );

    if (!response.ok) return false;

    const result = await response.json();
    if (!result.success || !result.exactMatch) return false;

    if (currentHTML.includes(result.exactMatch)) {
      const newHTML = currentHTML.replace(result.exactMatch, replacement);
      editor.commands.setContent(newHTML);
      return true;
    }
    return false;
  } catch {
    return false;
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
  const currentSelection = editor.state.selection;

  for (const change of changes) {
    const { selectionWithEllipsis, replace } = change;

    if (!selectionWithEllipsis) {
      editor.commands.setContent(replace);
      appliedChanges++;
      onProgress?.(appliedChanges, changes.length, false);
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

  if (appliedChanges > 0) {
    try {
      editor.commands.setTextSelection(currentSelection);
    } catch {
      editor.commands.focus("end");
    }
  }

  return {
    success: appliedChanges > 0,
    appliedChanges,
    usedLLMFallback,
  };
}
