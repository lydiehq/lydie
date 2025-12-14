import { tool } from "ai";
import { z } from "zod";

export const replaceInDocument = () =>
  tool({
    onInputDelta: (delta) => {
      console.log("Input delta:", delta);
    },
    description: `Replace content in the current document. Use this for ALL document modifications.

**CRITICAL: Changes require user approval. When you use this tool, the changes are NOT immediately applied to the document. They are presented to the user for review, and the user must manually accept them before they appear in the document. Never claim the content has been "added" or "placed" in the document—it's only prepared for review.**

**IMPORTANT: Use readCurrentDocument tool FIRST before making replacements (unless using overwrite mode).**

**CRITICAL: The \`replace\` parameter must be HTML, not Markdown. Use HTML tags like <p>, <h2>, etc.**

**Overwrite Mode:**
- Use \`overwrite: true\` to replace entire document (more efficient). \`search\` ignored. Use when user wants overwrite or document empty.

**Search Text Rules (when overwrite is false):**
- Empty document (wordCount = 0): search ""
- Non-empty document (wordCount > 0): NEVER use search "" - either read document first or search for specific content
- PREFER closing tags only: "distinctive content.</p>" not "<p>distinctive content.</p>"
- Use MINIMAL text (10-30 words) that uniquely identifies location
- Good: "economic growth and sustainability.</p>" | Bad: "</p>"
- Examples: "Chapter Title</h2>", "last item.</li>", "link text</a>"

**Appending Content:**
- Search for ONLY the last sentence/tag from existing content
- Replace it with itself + new content
- ✓ Efficient: search "last sentence.</p>", replace "last sentence.</p><p>New content.</p>"
- ✗ Inefficient: search "entire 100+ word paragraph...</p>"

**Sequential Additions Example (only for empty documents):**
1. search "", replace "<h2>Intro</h2><p>First para.</p>"
2. search "First para.</p>", replace "First para.</p><p>Second para.</p>"
3. search "Second para.</p>", replace "Second para.</p><h2>End</h2>"

**Internal Links:**
Format: <a href="internal://DOCUMENT_ID">Link Text</a>
Use internal:// protocol (not external URLs) to link other workspace documents. Get DOCUMENT_ID from searchDocuments tool.

**Special Cases:**
- Empty document (wordCount = 0): search "" OR use overwrite: true
- Delete content: replace ""
- Document is minified HTML (no spaces between tags)`,
    inputSchema: z.object({
      search: z
        .string()
        .describe(
          "Exact text to find. PREFER closing tags only (e.g., 'text.</p>'). Use 10-30 words max—just enough to uniquely identify location. For appending, use only last sentence/tag. Use empty string for empty document. Ignored when overwrite is true."
        )
        .optional(),
      replace: z
        .string()
        .describe(
          'Replacement text in HTML format (not Markdown). Empty string deletes. Internal links: <a href="internal://DOCUMENT_ID">Text</a>'
        ),
      overwrite: z
        .boolean()
        .describe(
          "If true, replace the entire document content with the replace text. The search parameter is ignored. Use this when user wants to overwrite the document or when document is empty."
        )
        .optional()
        .default(false),
    }),
    execute: async function ({ search, replace, overwrite }) {
      return {
        search: search ?? "",
        replace,
        overwrite: overwrite ?? false,
      };
    },
  });
