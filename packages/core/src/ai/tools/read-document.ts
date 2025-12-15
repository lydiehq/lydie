import { tool } from "ai";
import { z } from "zod";
import { db, documentsTable } from "@lydie/database";
import { eq, and, ilike } from "drizzle-orm";
import { renderContentToHTML } from "../../serialization";

export const readDocument = (userId: string, organizationId: string) =>
  tool({
    description: `Read the full content of a specific document by ID or title.
Use this tool when you need to access the complete content of a document to reference specific information,
quote passages, or understand the full context of a document.`,
    inputSchema: z.object({
      documentId: z
        .string()
        .describe("The unique ID of the document to read")
        .optional(),
      documentTitle: z
        .string()
        .describe(
          "The title of the document to read (will search for exact or partial matches)"
        )
        .optional(),
      includeMetadata: z
        .boolean()
        .describe(
          "Whether to include document metadata like creation date, slug, etc."
        )
        .default(false),
    }),
    execute: async function* ({
      documentId,
      documentTitle,
      includeMetadata = false,
    }) {
      if (!documentId && !documentTitle) {
        yield {
          state: "error",
          error: "Either documentId or documentTitle must be provided",
        };
        return;
      }

      // Yield initial searching state
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
          jsonContent: documentsTable.jsonContent,
          slug: documentsTable.slug,
          createdAt: documentsTable.createdAt,
          updatedAt: documentsTable.updatedAt,
        })
        .from(documentsTable)
        .$dynamic();

      const conditions = [
        eq(documentsTable.userId, userId),
        eq(documentsTable.organizationId, organizationId),
      ];

      if (documentId) {
        conditions.push(eq(documentsTable.id, documentId));
      } else if (documentTitle) {
        conditions.push(ilike(documentsTable.title, `%${documentTitle}%`));
      }

      // Apply all conditions at once
      query = query.where(and(...conditions));

      const documents = await query.limit(1);

      if (documents.length === 0) {
        const searchTerm = documentId
          ? `ID "${documentId}"`
          : `title containing "${documentTitle}"`;
        yield {
          state: "error",
          error: `No document found with ${searchTerm}`,
        };
        return;
      }

      const document = documents[0];

      // Yield reading state
      yield {
        state: "reading",
        message: `Reading document "${document.title}"...`,
        documentTitle: document.title,
      };

      // Add fake delay to see loading state (remove in production)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Convert jsonContent to HTML using our custom renderer
      let htmlContent: string;
      try {
        htmlContent = renderContentToHTML(document.jsonContent as any);
      } catch (error) {
        console.error(
          "[ReadDocument] Error converting jsonContent to HTML:",
          error
        );
        // Fallback to raw JSON string if conversion fails
        htmlContent = JSON.stringify(document.jsonContent, null, 2);
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

      // Yield final success state with document data
      yield {
        state: "success",
        message: `Successfully retrieved document: "${document.title}"`,
        document: result,
      };
    },
  });
