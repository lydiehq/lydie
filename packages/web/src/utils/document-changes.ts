// Normalize HTML by removing attributes and extra paragraph wrapping to enable fuzzy matching
function normalizeHTMLForMatching(html: string): string {
  return (
    html
      // Remove all attributes from tags (keep only tag names)
      .replace(/<(\w+)[^>]*>/g, "<$1>")
      // Remove paragraph wrapping around links and other inline elements
      .replace(/<li><p><a>/g, "<li><a>")
      .replace(/<\/a><\/p><\/li>/g, "</a></li>")
      .replace(/<p><a>/g, "<a>")
      .replace(/<\/a><\/p>/g, "</a>")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  )
}

// Try to find and replace content with tolerance for HTML attribute differences
function tryWithAttributeTolerance(
  currentHTML: string,
  searchText: string,
  replaceText: string,
): { found: boolean; newHTML?: string; normalizedSearch?: string } {
  const normalizedSearch = normalizeHTMLForMatching(searchText)
  const normalizedCurrent = normalizeHTMLForMatching(currentHTML)

  if (normalizedCurrent.includes(normalizedSearch)) {
    // For the Sources section case, we need a more targeted approach
    if (searchText.includes("<h2>Sources</h2>")) {
      // Find the Sources section in the current HTML
      const sourcesIndex = currentHTML.indexOf("<h2>Sources</h2>")
      if (sourcesIndex !== -1) {
        // Find the end of the sources section (either next h2 or end of document)
        const afterSources = currentHTML.substring(sourcesIndex)
        const nextH2Index = afterSources.indexOf("<h2>", 1) // Start from position 1 to skip the current h2

        let endIndex: number
        if (nextH2Index !== -1) {
          endIndex = sourcesIndex + nextH2Index
        } else {
          // Find the end by looking for the last </ul> or </ol> after Sources
          const listEndIndex = afterSources.lastIndexOf("</ul>")
          if (listEndIndex !== -1) {
            endIndex = sourcesIndex + listEndIndex + 5 // +5 for "</ul>".length
          } else {
            endIndex = currentHTML.length
          }
        }

        // Extract everything before and after the sources section
        const before = currentHTML.substring(0, sourcesIndex)
        const after = currentHTML.substring(endIndex)

        // Construct new HTML
        const newHTML = before + replaceText + after

        return {
          found: true,
          newHTML,
          normalizedSearch,
        }
      }
    }

    // Fallback: Try finding the structure in the document by looking for key patterns
    const searchLines = searchText.split("\n").filter((line) => line.trim())
    if (searchLines.length > 0) {
      // Try to find the beginning and end patterns
      const firstLine = searchLines[0].trim()
      const lastLine = searchLines[searchLines.length - 1].trim()

      // Extract text content from the lines
      const firstLineText = firstLine.replace(/<[^>]*>/g, "").trim()
      const lastLineText = lastLine.replace(/<[^>]*>/g, "").trim()

      if (firstLineText && lastLineText) {
        const firstIndex = currentHTML.indexOf(firstLineText)
        const lastIndex = currentHTML.indexOf(lastLineText)

        if (firstIndex !== -1 && lastIndex !== -1 && lastIndex > firstIndex) {
          const startOfLastLine = lastIndex
          const endOfLastLine = currentHTML.indexOf(">", lastIndex + lastLineText.length) + 1

          if (endOfLastLine > startOfLastLine) {
            const before = currentHTML.substring(0, firstIndex)
            const after = currentHTML.substring(endOfLastLine)
            const newHTML = before + replaceText + after

            return {
              found: true,
              newHTML,
              normalizedSearch,
            }
          }
        }
      }
    }
  }

  return { found: false }
}

function findAndReplaceInDocument(editor: any, searchText: string, replaceText: string): boolean {
  const currentHTML = editor.getHTML()

  // Safety check: reject empty search strings when document is not empty
  // Empty string matches anywhere, which would cause duplicate insertions
  if (searchText === "" && !editor.isEmpty) {
    console.warn(
      "Cannot use empty search string on non-empty document. This would cause duplicate insertions.",
    )
    return false
  }

  // Strategy 1: Try exact match first
  if (currentHTML.includes(searchText)) {
    const newHTML = currentHTML.replace(searchText, replaceText)
    editor.commands.setContent(newHTML)
    return true
  }

  // Strategy 2: If search text starts with opening tag, try without it
  const openTagMatch = searchText.match(/^<([^>]+)>(.+)$/s)
  if (openTagMatch) {
    const [, , contentWithoutOpenTag] = openTagMatch

    if (currentHTML.includes(contentWithoutOpenTag)) {
      // Create the replacement by preserving any existing opening tag structure
      const replaceMatch = replaceText.match(/^<([^>]+)>(.+)$/s)
      const newReplaceText = replaceMatch ? replaceMatch[2] : replaceText

      const newHTML = currentHTML.replace(contentWithoutOpenTag, newReplaceText)
      editor.commands.setContent(newHTML)

      console.debug("Successfully applied change using fallback strategy (without opening tag):", {
        originalSearch: searchText,
        fallbackSearch: contentWithoutOpenTag,
        replaceText: newReplaceText,
      })

      return true
    }
  }

  // Strategy 3: If search text has both opening and closing tags, try with just closing tag
  const bothTagsMatch = searchText.match(/^<([^>]+)>(.+)<\/([^>]+)>$/s)
  if (bothTagsMatch) {
    const [, , content, closeTag] = bothTagsMatch
    const searchWithClosingOnly = `${content}</${closeTag}>`

    if (currentHTML.includes(searchWithClosingOnly)) {
      // For replace text, if it has the same structure, preserve just the content + closing tag
      const replaceMatch = replaceText.match(/^<([^>]+)>(.+)<\/([^>]+)>$/s)
      const newReplaceText = replaceMatch ? `${replaceMatch[2]}</${replaceMatch[3]}>` : replaceText

      const newHTML = currentHTML.replace(searchWithClosingOnly, newReplaceText)
      editor.commands.setContent(newHTML)

      console.debug("Successfully applied change using fallback strategy (with closing tag only):", {
        originalSearch: searchText,
        fallbackSearch: searchWithClosingOnly,
        replaceText: newReplaceText,
      })

      return true
    }
  }

  // Strategy 4: Handle HTML attribute differences (e.g., target="_blank" in links)
  const attributeToleranceResult = tryWithAttributeTolerance(currentHTML, searchText, replaceText)
  if (attributeToleranceResult.found) {
    editor.commands.setContent(attributeToleranceResult.newHTML)

    console.debug("Successfully applied change using attribute tolerance strategy:", {
      originalSearch: searchText,
      fallbackSearch: attributeToleranceResult.normalizedSearch,
      replaceText: replaceText,
    })

    return true
  }

  // Strategy 5: Try searching for just the text content (strip all HTML)
  // BUT: Skip this if replacement text contains HTML we want to preserve (like links)
  const replaceTextHasHTML = /<[^>]+>/.test(replaceText)
  const replaceTextHasLinks = /<a[^>]*>/.test(replaceText)

  if (!replaceTextHasHTML && !replaceTextHasLinks) {
    const searchTextOnly = searchText.replace(/<[^>]*>/g, "")
    const replaceTextOnly = replaceText.replace(/<[^>]*>/g, "")

    if (searchTextOnly.trim() && currentHTML.includes(searchTextOnly)) {
      const newHTML = currentHTML.replace(searchTextOnly, replaceTextOnly)
      editor.commands.setContent(newHTML)

      console.debug("Successfully applied change using text-only fallback strategy:", {
        originalSearch: searchText,
        fallbackSearch: searchTextOnly,
        replaceText: replaceTextOnly,
      })

      return true
    }
  }

  return false
}

// Create a detailed error report for LLM debugging
function createApplyErrorReport(
  change: { search: string; replace: string },
  editor: any,
  error?: Error,
): string {
  const currentHTML = editor.getHTML()
  const currentText = editor.getText()

  return `
=== APPLY ERROR REPORT ===
📅 Timestamp: ${new Date().toISOString()}
❌ Error: Failed to apply content change

📋 CHANGE DETAILS:
Search Text: """
${change.search}
"""

Replace Text: """
${change.replace}
"""

📄 CURRENT DOCUMENT STATE:
HTML Content: """
${currentHTML}
"""

Plain Text: """
${currentText}
"""

🔍 DEBUGGING INFO:
- Search text length: ${change.search.length} characters
- Replace text length: ${change.replace.length} characters
- Document HTML length: ${currentHTML.length} characters
- Document is empty: ${editor.isEmpty}
- Search text found in HTML: ${currentHTML.includes(change.search)}
- Normalized search found: ${currentHTML.replace(/\s+/g, " ").includes(change.search.replace(/\s+/g, " "))}

🚨 ERROR DETAILS:
${error ? `Error message: ${error.message}\nStack trace: ${error.stack}` : "No specific error thrown"}

📝 COPY THIS ENTIRE REPORT TO DEBUG WITH LLM
=== END REPORT ===
  `.trim()
}

// LLM-assisted fallback for finding exact match in document
async function llmAssistedReplace(
  editor: any,
  searchText: string,
  replaceText: string,
  organizationId: string,
): Promise<boolean> {
  try {
    const currentHTML = editor.getHTML()

    const response = await fetch(import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/llm-replace", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Organization-Id": organizationId,
      },
      body: JSON.stringify({
        currentHTML,
        searchText,
        replaceText,
      }),
    })

    if (!response.ok) {
      console.error("LLM replace endpoint failed:", response.statusText)
      return false
    }

    const result = await response.json()

    if (!result.success || !result.exactMatch) {
      console.error("LLM could not find exact match:", result)
      return false
    }

    // Verify the exact match exists and replace it
    if (currentHTML.includes(result.exactMatch)) {
      const newHTML = currentHTML.replace(result.exactMatch, replaceText)
      editor.commands.setContent(newHTML)

      console.debug("Successfully applied change using LLM-assisted fallback:", {
        originalSearch: searchText,
        llmFoundMatch: result.exactMatch,
        replaceText: replaceText,
      })

      return true
    }

    console.error("LLM returned match that doesn't exist in document")
    return false
  } catch (error) {
    console.error("LLM-assisted replace failed:", error)
    return false
  }
}

// Apply content changes to the editor
// This preserves editor state without any automatic title extraction
export async function applyContentChanges(
  editor: any,
  changes: Array<{
    search: string
    replace: string
  }>,
  organizationId: string,
  onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  onLLMStateChange?: (isUsingLLM: boolean) => void,
): Promise<{
  success: boolean
  error?: string
  appliedChanges: number
  errorReport?: string
  usedLLMFallback?: boolean
}> {
  try {
    let appliedChanges = 0
    let errorReport: string | undefined
    let usedLLMFallback = false

    // Save current cursor position and selection
    const currentSelection = editor.state.selection

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]
      const { search, replace } = change

      // Handle full document replacement (empty search means replace entire document)
      if (search === "") {
        editor.commands.setContent(replace)

        console.debug("Successfully replaced entire document:", {
          replaceText: replace,
        })

        appliedChanges++
        onProgress?.(appliedChanges, changes.length, false)
        continue
      }

      // Try existing strategies first
      const found = findAndReplaceInDocument(editor, search, replace)
      if (found) {
        console.debug("Successfully applied change:", {
          searchText: search,
          replaceText: replace,
        })

        appliedChanges++
        onProgress?.(appliedChanges, changes.length, false)
      } else {
        // Strategy 6: Try LLM-assisted fallback
        console.warn("All strategies failed, trying LLM-assisted fallback for:", search.substring(0, 100))

        onLLMStateChange?.(true)
        onProgress?.(appliedChanges, changes.length, true)
        try {
          const llmFound = await llmAssistedReplace(editor, search, replace, organizationId)

          if (llmFound) {
            console.log("✅ LLM-assisted fallback succeeded!")
            appliedChanges++
            usedLLMFallback = true
            onProgress?.(appliedChanges, changes.length, false)
          } else {
            // Create detailed error report
            errorReport = createApplyErrorReport(change, editor)
            console.error("APPLY FAILED - Copy this report for debugging:")
            console.error(errorReport)

            // Also show a user-friendly notification
            console.error("Failed to apply change - search text not found:", {
              searchText: search,
              replaceText: replace,
              currentDocumentHTML: editor.getHTML(),
            })
            onProgress?.(appliedChanges, changes.length, false)
          }
        } finally {
          onLLMStateChange?.(false)
        }
      }
    }

    // Restore selection if no specific position was set
    if (appliedChanges > 0) {
      try {
        editor.commands.setTextSelection(currentSelection)
      } catch {
        // Selection might not be valid anymore, focus at end
        editor.commands.focus("end")
      }
    }

    return {
      success: true,
      appliedChanges,
      errorReport,
      usedLLMFallback,
    }
  } catch (error) {
    // Create comprehensive error report for unexpected errors
    const errorReport = `
=== UNEXPECTED APPLY ERROR ===
📅 Timestamp: ${new Date().toISOString()}
❌ Error: Unexpected error during content application

📋 ATTEMPTED CHANGES:
${changes
  .map(
    (change, index) => `
Change ${index + 1}:
  Search: """${change.search}"""
  Replace: """${change.replace}"""
`,
  )
  .join("\n")}

📄 EDITOR STATE:
- Editor available: ${!!editor}
- Editor isEmpty: ${editor?.isEmpty ?? "unknown"}
- Current HTML: """${editor?.getHTML?.() ?? "unable to get HTML"}"""

🚨 ERROR DETAILS:
${
  error instanceof Error
    ? `
Error type: ${error.constructor.name}
Error message: ${error.message}
Stack trace: ${error.stack}
`
    : `
Non-Error thrown: ${String(error)}
`
}

📝 COPY THIS ENTIRE REPORT TO DEBUG WITH LLM
=== END REPORT ===
    `.trim()

    console.error("UNEXPECTED APPLY ERROR - Copy this report for debugging:")
    console.error(errorReport)

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      appliedChanges: 0,
      errorReport,
      usedLLMFallback: false,
    }
  }
}
