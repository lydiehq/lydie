import { db, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, asc, desc, eq, ilike, isNull, ne } from "drizzle-orm";
import { z } from "zod";

// User-facing tool for displaying documents in a pretty UI.
// Use this when the user explicitly asks to SEE their documents.
// For research/background exploration, use listDocuments instead.
export const showDocuments = (
  _userId: string,
  organizationId: string,
  currentDocumentId?: string,
) =>
  tool({
    description: `Show documents to the user in a visually appealing way.
Use this tool when the user EXPLICITLY asks to see, view, or display their documents.
This will render a nice interactive list that the user can click on.

**When to use this tool:**
- "Show me my documents"
- "Display my latest 5 documents"
- "What documents do I have?" (when they want to see them, not just know about them)
- "List my recent files"

**When NOT to use this tool:**
- When you need to understand the workspace for your own research (use listDocuments instead)
- When searching for specific content (use searchDocuments instead)`,
    inputSchema: z.object({
      limit: z.number().describe("Maximum number of documents to show").min(1).max(20).default(5),
      sortBy: z
        .enum(["title", "updated", "created"])
        .describe("How to sort the documents")
        .default("updated"),
      sortOrder: z.enum(["asc", "desc"]).describe("Sort order").default("desc"),
      titleFilter: z
        .string()
        .describe("Filter documents by title (partial match, case-insensitive)")
        .optional(),
    }),
    execute: async function* ({ limit = 5, sortBy = "updated", sortOrder = "desc", titleFilter }) {
      yield {
        state: "loading",
        message: titleFilter
          ? `Finding documents matching "${titleFilter}"...`
          : "Loading your documents...",
      };

      let orderBy;
      switch (sortBy) {
        case "title":
          orderBy = sortOrder === "asc" ? asc(documentsTable.title) : desc(documentsTable.title);
          break;
        case "created":
          orderBy =
            sortOrder === "asc" ? asc(documentsTable.createdAt) : desc(documentsTable.createdAt);
          break;
        case "updated":
        default:
          orderBy =
            sortOrder === "asc" ? asc(documentsTable.updatedAt) : desc(documentsTable.updatedAt);
          break;
      }

      const conditions = [
        eq(documentsTable.organizationId, organizationId),
        isNull(documentsTable.deletedAt),
      ];

      if (currentDocumentId) {
        conditions.push(ne(documentsTable.id, currentDocumentId));
      }

      if (titleFilter) {
        conditions.push(ilike(documentsTable.title, `%${titleFilter}%`));
      }

      const documents = await db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          slug: documentsTable.slug,
          createdAt: documentsTable.createdAt,
          updatedAt: documentsTable.updatedAt,
        })
        .from(documentsTable)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit);

      const results = documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }));

      yield {
        state: "success",
        message:
          documents.length === 0
            ? "No documents found."
            : `Here ${documents.length === 1 ? "is" : "are"} your ${documents.length === 1 ? "document" : `${documents.length} documents`}:`,
        documents: results,
        totalFound: documents.length,
        filters: {
          titleFilter: titleFilter || null,
          sortBy,
          sortOrder,
          limit,
        },
      };
    },
  });
