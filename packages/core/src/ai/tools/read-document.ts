import { db, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { serializeToHTML } from "../../serialization/html";
import { getHocuspocusDocumentState, isHocuspocusAvailable } from "../../document-state";
import { convertYjsToJson } from "../../yjs-to-json";

export const readDocument = (userId: string, organizationId: string) =>
  tool({
    description: `Read the full content of a document by ID or title.

Returns complete HTML content plus optional metadata (creation date, slug, etc.).

CRITICAL: Always read before editing. Use this to understand document structure, answer content questions, or reference other documents.`,
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
      preferFresh: z
        .boolean()
        .describe("Whether to prefer real-time document state from collaborative editing session (if available). Default: true")
        .default(true),
    }),
    execute: async function* ({ documentId, documentTitle, includeMetadata = false, preferFresh = true }) {
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

      // Try to get real-time state from Hocuspocus if available and requested
      let yjsState: string | null = document.yjsState;
      let source = "database";

      if (preferFresh && documentId && isHocuspocusAvailable()) {
        const hocuspocusState = getHocuspocusDocumentState(documentId);
        if (hocuspocusState) {
          yjsState = Buffer.from(hocuspocusState).toString("base64");
          source = "real-time";
        }
      }

      const jsonContent = convertYjsToJson(yjsState);

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
        source, // Indicates whether content came from "database" or "real-time"
      };

      if (includeMetadata) {
        result.slug = document.slug;
        result.createdAt = document.createdAt.toISOString();
        result.updatedAt = document.updatedAt.toISOString();
      }

      yield {
        state: "success",
        message: `Successfully retrieved document: "${document.title}" (${source})`,
        document: result,
      };
    },
  });
