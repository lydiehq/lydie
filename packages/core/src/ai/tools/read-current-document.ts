import { tool } from "ai"
import { z } from "zod"
import { db, documentsTable } from "@lydie/database"
import { eq } from "drizzle-orm"
import { serializeToHTML } from "../../serialization/html"
import { convertYjsToJson } from "../../yjs-to-json"

export const readCurrentDocument = (documentId: string) =>
	tool({
		description: `Read the full content of the current document you're working on.
Use this tool BEFORE making any edits with replaceInDocument to understand what content exists in the document.

**When to use this tool:**
- Before making ANY edits to the document (e.g., "edit all headings", "make text italic", "add a section")
- When the user asks questions about the current document content
- When you need to understand the structure or format of the document
- When the user asks to modify or reference specific parts of the document

**Examples:**
- User: "Please edit all headings to be in italic" → First use readCurrentDocument, then use replaceInDocument for each heading
- User: "Add a conclusion section" → First use readCurrentDocument to see where to add it, then use replaceInDocument
- User: "What's in this document?" → Use readCurrentDocument to see the content`,
		inputSchema: z.object({}),
		execute: async function* () {
			// Yield initial loading state
			yield {
				state: "reading",
				message: "Reading current document...",
			}

			const [document] = await db
				.select({
					id: documentsTable.id,
					title: documentsTable.title,
					yjsState: documentsTable.yjsState,
				})
				.from(documentsTable)
				.where(eq(documentsTable.id, documentId))
				.limit(1)

			if (!document) {
				yield {
					state: "error",
					error: `Document with ID "${documentId}" not found`,
				}
				return
			}

			// Yield processing state
			yield {
				state: "processing",
				message: `Processing document "${document.title}"...`,
				documentTitle: document.title,
			}

			// Add fake delay to see loading state (remove in production)
			await new Promise((resolve) => setTimeout(resolve, 1000))

			// Use Yjs as source of truth
			if (!document.yjsState) {
				yield {
					state: "error",
					error: "Document has no content (yjsState is missing)",
				}
				return
			}

			const jsonContent = convertYjsToJson(document.yjsState)

			// Convert jsonContent to HTML using our custom renderer
			let htmlContent: string
			try {
				htmlContent = serializeToHTML(jsonContent as any)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				console.error("[ReadCurrentDocument] Error converting jsonContent to HTML:", error)

				// Yield error state
				yield {
					state: "error",
					error: `Failed to read document content: ${errorMessage}. The document may have an unsupported format. Try using searchInDocument instead to find specific content.`,
					title: document.title,
				}
				return
			}

			// Yield final success state with content
			yield {
				state: "success",
				message: `Current document content retrieved successfully`,
				title: document.title,
				content: htmlContent,
			}
		},
	})
