import { tool } from "ai";
import { z } from "zod";

export const replaceInDocument = () =>
  tool({
    description: `Modify document content using precise selection patterns.

**CRITICAL: You MUST specify the documentId parameter.**

**CRITICAL: Changes require user approval before being applied.**

**CRITICAL: The \`replace\` parameter must be HTML, not Markdown.**

**Title and Content Separation:**
- Use the \`title\` parameter for document title (plain text)
- **DO NOT include H1 headings in the content** - content starts with H2

**Selection Format (Ellipsis Pattern):**
Use \`selectionWithEllipsis\` with three dots (...) as separator.

**Three Patterns:**

1. **APPEND after content** - Pattern: "...endText"
   - Finds the LAST occurrence of endText
   - Replaces just that endText with: endText + new content
   - Example: selectionWithEllipsis: "...mysteries that lie ahead.</p>"
     replace: "mysteries that lie ahead.</p><h2>Chapter 4</h2><p>New content...</p>"

2. **PREPEND before content** - Pattern: "startText..."
   - Finds the FIRST occurrence of startText
   - Replaces just that startText with: new content + startText
   - Example: selectionWithEllipsis: "<h2>Introduction...</h2>"
     replace: "<h2>New Section</h2><p>Content...</p><h2>Introduction</h2>"

3. **REPLACE a range** - Pattern: "startText...endText"
   - Finds content starting with startText and ending with endText
   - Replaces the entire range
   - Example: selectionWithEllipsis: "<h2>Old Section</h2>...end of section.</p>"
     replace: "<h2>New Section</h2><p>New content...</p>"

**Rules:**
- For APPEND/PREPEND: Include the anchor text in your replacement
- For RANGE: Replace everything between start and end
- Include closing tags (</p>, </h2>) for precision
- Use 10-30 words of context to uniquely identify the location

**Only use empty selectionWithEllipsis ("") when:**
- Document is empty (wordCount = 0)
- User explicitly says "rewrite everything"

**Internal Links:** <a href="internal://DOCUMENT_ID">Link Text</a>

**Task Lists:** <ul data-type="taskList"><li data-type="taskItem" data-checked="true">Task</li></ul>`,
    inputSchema: z.object({
      documentId: z
        .string()
        .describe("ID of the document to modify."),
      title: z
        .string()
        .optional()
        .describe("New title for the document (plain text, no HTML)."),
      selectionWithEllipsis: z
        .string()
        .describe(
          'Target content using ellipsis pattern: "...end" (append), "start..." (prepend), or "start...end" (replace). Use "" only for empty documents.'
        ),
      replace: z
        .string()
        .describe(
          'Replacement text in HTML. For append/prepend, include anchor text + new content. Empty string deletes.'
        ),
    }),
    execute: async function ({ documentId, title, selectionWithEllipsis, replace }) {
      return {
        documentId,
        title: title ?? undefined,
        selectionWithEllipsis,
        replace,
      };
    },
  });
