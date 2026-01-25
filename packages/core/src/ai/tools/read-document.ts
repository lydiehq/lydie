import { db, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { serializeToHTML } from "../../serialization/html";
import { convertYjsToJson } from "../../yjs-to-json";

export const readDocument = (userId: string, organizationId: string) =>
  tool({
    description: `Read the full content of a document by ID or title.
Use this tool to access the complete content of any document, including the current document the user is working on.

**When to use this tool:**
- Before making ANY edits to a document (e.g., "edit all headings", "make text italic", "add a section")
- When the user asks questions about document content
- When you need to understand the structure or format of a document
- When the user asks to modify or reference specific parts of a document
- To reference information from other documents

**Examples:**
- User: "Please edit all headings to be in italic" → First use readDocument, then use replaceInDocument for each heading
- User: "Add a conclusion section" → First use readDocument to see where to add it, then use replaceInDocument
- User: "What's in this document?" → Use readDocument to see the content
- User: "Compare this with the Product Roadmap" → Use readDocument to read the other document`,
    inputSchema: z.object({
      documentId: z.string().describe("The unique ID of the document to read").optional(),
      documentTitle: z
        .string()
        .describe("The title of the document to read (will search for exact or partial matches)")
        .optional(),
      includeMetadata: z
        .boolean()
        .describe("Whether to include document metadata like creation date, slug, etc.")
        .default(false),
    }),
    execute: async function* ({ documentId, documentTitle, includeMetadata = false }) {
      if (!documentId && !documentTitle) {
        yield {
          state: "error",
          error: "Either documentId or documentTitle must be provided",
        };
        return;
      }

      yield {
        state: "searching",
        message: documentTitle
          ? `Searching for document "${documentTitle}"...`
          : "Searching for document...",
      };

      let query = db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          yjsState: documentsTable.yjsState,
          slug: documentsTable.slug,
          createdAt: documentsTable.createdAt,
          updatedAt: documentsTable.updatedAt,
        })
        .from(documentsTable)
        .$dynamic();

      const conditions = [eq(documentsTable.organizationId, organizationId)];

      if (documentId) {
        conditions.push(eq(documentsTable.id, documentId));
      } else if (documentTitle) {
        conditions.push(ilike(documentsTable.title, `%${documentTitle}%`));
      }

      query = query.where(and(...conditions));

      const documents = await query.limit(1);

      if (documents.length === 0) {
        const searchTerm = documentId
          ? `ID "${documentId}"`
          : `title containing "${documentTitle}"`;
        yield {
          state: "error",
          error: `No document found with ${searchTerm} `,
        };
        return;
      }

      const document = documents[0];

      if (!document) {
        yield {
          state: "error",
          error: `No document found with ${
            documentId ? `ID "${documentId}"` : `title containing "${documentTitle}"`
          }`,
        };
        return;
      }

      yield {
        state: "reading",
        message: `Reading document "${document.title}"...`,
        documentTitle: document.title,
      };

      const jsonContent = convertYjsToJson(document.yjsState);

      let htmlContent: string;
      try {
        htmlContent = serializeToHTML(jsonContent as any);
      } catch (error) {
        console.error("[ReadDocument] Error converting jsonContent to HTML:", error);
        htmlContent = JSON.stringify(jsonContent, null, 2);
      }

      const result: any = {
        id: document.id,
        title: document.title,
        content: htmlContent,
      };

      if (includeMetadata) {
        result.slug = document.slug;
        result.createdAt = document.createdAt.toISOString();
        result.updatedAt = document.updatedAt.toISOString();
      }

      yield {
        state: "success",
        message: `Successfully retrieved document: "${document.title}"`,
        document: result,
      };
    },
  });
