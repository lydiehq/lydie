import { tool } from "ai"
import { z } from "zod"

export const replaceInDocument = () =>
  tool({
    onInputDelta: (delta) => {
      console.log("Input delta:", delta)
    },
    description: `Replace content in a document. Use this for ALL document modifications.

**CRITICAL: You MUST specify the documentId parameter. Use the "Current Document" ID from the context information provided to you. If you need to modify a different document, use its ID instead.**

**CRITICAL: Changes require user approval. When you use this tool, the changes are NOT immediately applied to the document. They are presented to the user for review, and the user must manually accept them before they appear in the document. Never claim the content has been "added" or "placed" in the document—it's only prepared for review.**

**CRITICAL: The \`replace\` parameter must be HTML, not Markdown. Use HTML tags like <p>, <h2>, etc.**

**How to Use:**
- **To replace entire document**: Use empty string for search (search: ""). This will replace all content in the document. Use for empty documents (wordCount = 0) or when task requires rewriting entire document.
- **To modify specific content**: Provide search text to find the content you want to replace. Use targeted search strings to identify the exact location.

**Search Text Rules:**
- Empty document (wordCount = 0): Use search "" to replace entire document
- Non-empty document (wordCount > 0): 
  - To replace entire document: Use search ""
  - To modify specific content: Provide search text (10-30 words) that uniquely identifies the location
  - PREFER closing tags only: "distinctive content.</p>" not "<p>distinctive content.</p>"
  - Good: "economic growth and sustainability.</p>" | Bad: "</p>"
  - Examples: "Chapter Title</h2>", "last item.</li>", "link text</a>"

**Appending Content:**
- Search for ONLY the last sentence/tag from existing content
- Replace it with itself + new content
- ✓ Efficient: search "last sentence.</p>", replace "last sentence.</p><p>New content.</p>"
- ✗ Inefficient: search "entire 100+ word paragraph...</p>"

**Internal Links:**
Format: <a href="internal://DOCUMENT_ID">Link Text</a>
Use internal:// protocol (not external URLs) to link other workspace documents. Get DOCUMENT_ID from searchDocuments tool.

**Special Cases:**
- Empty document (wordCount = 0): Use search "" to replace entire document
- Delete content: Use search to find content, replace with empty string ""
- Document is minified HTML (no spaces between tags)`,
    inputSchema: z.object({
      documentId: z
        .string()
        .describe(
          "ID of the document to modify. This is the document where the replacement will be applied.",
        ),
      search: z
        .string()
        .describe(
          "Exact text to find. PREFER closing tags only (e.g., 'text.</p>'). Use 10-30 words max—just enough to uniquely identify location. For appending, use only last sentence/tag. Use empty string to replace entire document.",
        )
        .optional(),
      replace: z
        .string()
        .describe(
          'Replacement text in HTML format (not Markdown). Empty string deletes. Internal links: <a href="internal://DOCUMENT_ID">Text</a>',
        ),
    }),
    execute: async function ({ documentId, search, replace }) {
      return {
        documentId,
        search: search ?? "",
        replace,
      }
    },
  })
