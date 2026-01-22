import { tool } from "ai"
import { z } from "zod"
import { db, documentsTable, documentEmbeddingsTable } from "@lydie/database"
import { eq, and, sql } from "drizzle-orm"
import { generateEmbedding } from "../../embedding"

export const searchInDocument = (currentDocumentId: string, userId: string, organizationId: string) =>
  tool({
    description: `Read specific sections or content within a document.
This is the MOST EFFICIENT way to access specific parts of a document without loading the entire content.

**IMPORTANT: Present this to users as READING, not searching. Say "I'll read the X section" not "I'll search for X".**

**When to use this tool:**
- User asks about specific topics/sections (e.g., "What does the coffee section say?")
- Before making targeted edits to specific sections (e.g., "Edit the economics section")
- Finding specific content without reading the whole document
- Working with large documents (>5000 words)
- User references specific topics, headings, or concepts

**When NOT to use (use read_document instead):**
- Structural operations: "Make all headings italic", "Reorder sections"
- Document-wide changes: "Add conclusion at the end", "Insert after introduction"
- When you need to see the full document structure
- When location is positional rather than content-based

**How it works:**
- Locates relevant sections using AI
- Returns the most relevant content with heading context
- Each result includes the section heading for user clarity

**Examples:**
- User: "Improve the economics section"
  → searchInDocument(query: "economics section")
  → Present to user as: "I'll read the economics section"
  
- User: "What does this document say about Paris?"
  → searchInDocument(query: "Paris")
  → Present to user as: "Let me check what this says about Paris"
  
- User: "Fix the introduction"
  → searchInDocument(query: "introduction")
  → Present to user as: "I'll read the introduction"`,

    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The search query to find relevant content. Use key terms, concepts, or topics mentioned by the user. Examples: 'economics section', 'coffee brewing methods', 'introduction about climate'",
        ),
      documentId: z
        .string()
        .optional()
        .describe(
          `The ID of the document to search. Leave empty to search the current document (ID: ${currentDocumentId}). Only provide if searching a different document.`,
        ),
      limit: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe(
          "Number of relevant chunks to return. Default: 5. Use fewer (2-3) for specific queries, more (7-10) for broader searches.",
        ),
    }),

    execute: async function* ({ query, documentId, limit = 5 }) {
      // Yield initial searching state
      yield {
        state: "searching",
        message: `Searching for "${query}" in current document...`,
        query,
      }

      // Add fake delay to see loading state (remove in production)
      await new Promise((resolve) => setTimeout(resolve, 800))

      const targetDocumentId = documentId || currentDocumentId

      // Verify document access
      const [document] = await db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          organizationId: documentsTable.organizationId,
        })
        .from(documentsTable)
        .where(eq(documentsTable.id, targetDocumentId))
        .limit(1)

      if (!document) {
        return {
          error: `Document with ID "${targetDocumentId}" not found`,
          results: [],
        }
      }

      if (document.organizationId !== organizationId) {
        return {
          error: "You do not have permission to access this document",
          results: [],
        }
      }

      // Generate query embedding
      const queryEmbedding = await generateEmbedding(query)

      // Search document chunks
      const similarity = sql<number>`1 - (${
        documentEmbeddingsTable.embedding
      } <=> ${JSON.stringify(queryEmbedding)}::vector)`

      const results = await db
        .select({
          content: documentEmbeddingsTable.content,
          similarity,
          chunkIndex: documentEmbeddingsTable.chunkIndex,
          heading: documentEmbeddingsTable.heading,
          headingLevel: documentEmbeddingsTable.headingLevel,
        })
        .from(documentEmbeddingsTable)
        .where(
          and(
            eq(documentEmbeddingsTable.documentId, targetDocumentId),
            // Similarity threshold - more lenient for in-document search
            sql`(${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) < 0.6`,
          ),
        )
        .orderBy(sql`${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
        .limit(limit)

      if (results.length === 0) {
        yield {
          message: `No relevant content found in "${document.title}" for query: "${query}". Try using different search terms or use read_document to see the full document.`,
          documentTitle: document.title,
          documentId: targetDocumentId,
          results: [],
        }
        return
      }

      // Yield final result (this is what will be in tool.output)
      yield {
        message: `Found ${results.length} relevant chunk${
          results.length > 1 ? "s" : ""
        } in "${document.title}"`,
        documentTitle: document.title,
        documentId: targetDocumentId,
        query: query,
        results: results.map((r) => ({
          content: r.content,
          similarity: Math.round(r.similarity * 100) / 100, // Round to 2 decimals
          chunkIndex: r.chunkIndex,
          heading: r.heading,
          headingLevel: r.headingLevel,
        })),
      }
    },
  })
