import { tool } from "ai"
import { z } from "zod"
import { db, documentsTable } from "@lydie/database"
import { eq, and, desc, asc, ilike, isNull, ne } from "drizzle-orm"

export const listDocuments = (userId: string, organizationId: string, currentDocumentId?: string) =>
  tool({
    description: `List documents in the user's workspace with filtering and sorting options.
Use this tool when the user wants to see what documents they have available, 
find documents by title patterns, get their latest/recent/newest documents (by sorting), or get an overview of their workspace.

Examples: "What documents do I have?", "Show me my recent files", "List the latest 3 documents"`,
    inputSchema: z.object({
      limit: z.number().describe("Maximum number of documents to list").min(1).max(50).default(10),
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
    execute: async function* ({ limit = 10, sortBy = "updated", sortOrder = "desc", titleFilter }) {
      // Yield initial loading state
      yield {
        state: "loading",
        message: titleFilter
          ? `Searching for documents matching "${titleFilter}"...`
          : "Loading documents...",
      }

      let orderBy
      switch (sortBy) {
        case "title":
          orderBy = sortOrder === "asc" ? asc(documentsTable.title) : desc(documentsTable.title)
          break
        case "created":
          orderBy = sortOrder === "asc" ? asc(documentsTable.createdAt) : desc(documentsTable.createdAt)
          break
        case "updated":
        default:
          orderBy = sortOrder === "asc" ? asc(documentsTable.updatedAt) : desc(documentsTable.updatedAt)
          break
      }

      const conditions = [eq(documentsTable.organizationId, organizationId), isNull(documentsTable.deletedAt)]

      // Exclude current document if provided
      if (currentDocumentId) {
        conditions.push(ne(documentsTable.id, currentDocumentId))
      }

      // Add title filter if provided
      if (titleFilter) {
        conditions.push(ilike(documentsTable.title, `%${titleFilter}%`))
      }

      let query = db
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
        .limit(limit)

      const documents = await query

      const results = documents.map((doc) => {
        const result: any = {
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        }

        return result
      })

      const filterMessage = titleFilter ? ` matching "${titleFilter}"` : ""
      const sortMessage = `sorted by ${sortBy} (${sortOrder})`

      // Yield final result (this is what will be in tool.output)
      yield {
        state: "success",
        message: `Found ${documents.length} document${
          documents.length === 1 ? "" : "s"
        }${filterMessage} in your workspace, ${sortMessage}:`,
        documents: results,
        totalFound: documents.length,
        filters: {
          titleFilter: titleFilter || null,
          sortBy,
          sortOrder,
          limit,
        },
      }
    },
  })
