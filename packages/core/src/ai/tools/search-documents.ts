import { tool } from "ai"
import { z } from "zod"
import { searchDocuments as searchDocumentsFunction, hybridSearchDocuments } from "../../embedding/search"

// Constant minimum similarity threshold
const MIN_SIMILARITY = 0.3

export const searchDocuments = (userId: string, organizationId: string, currentDocumentId?: string) =>
  tool({
    description: `Advanced search through all the user's documents with multiple search strategies.
Use this tool when the user asks about content in their documents, wants to find specific information,
or needs to reference information from their workspace. 

**IMPORTANT: Do NOT use this tool for finding "recent", "latest", or "newest" documents. Use the listDocuments tool for those queries as it allows sorting by creation/update time.**

Examples: "Show me documents about coffee", "Find my meeting notes", "What documents mention project deadlines?"

**Search Strategies:**
- 'title_first': Best for "find my document about X" or "reference my X document" 
- 'content_first': Best for finding specific information or concepts within documents
- 'both': Combines both approaches for comprehensive results

**When to use each strategy:**
- Use 'title_first' when user mentions "my document about...", "the X document", or refers to a specific document
- Use 'content_first' when user asks about concepts, facts, or specific information
- Use 'both' when unsure or when comprehensive search is needed`,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The search query. Use the user's exact question or key terms they're looking for. Examples: 'marketing strategy', 'project timeline', 'user research findings', 'coffee brewing methods', 'art of matcha'",
        ),
      searchStrategy: z
        .enum(["title_first", "content_first", "both"])
        .describe(
          "Search strategy: 'title_first' for finding documents by name/topic, 'content_first' for finding specific information, 'both' for comprehensive search",
        )
        .default("both"),
      limit: z.number().describe("The maximum number of results to return.").min(1).max(10).default(5),
    }),
    execute: async function* ({ query, searchStrategy = "both", limit = 5 }) {
      // Yield initial searching state
      yield {
        state: "searching",
        message: `Searching documents for "${query}"...`,
        query,
      }

      // Add fake delay to see loading state (remove in production)
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Always exclude current document if currentDocumentId is provided
      const excludeCurrentDocument = !!currentDocumentId

      let searchResults: any[] = []

      if (searchStrategy === "title_first" || searchStrategy === "both") {
        // Use hybrid search for title-first or both strategies
        searchResults = await hybridSearchDocuments(
          query,
          userId,
          organizationId,
          searchStrategy,
          limit + (excludeCurrentDocument ? 3 : 0),
        )
      } else {
        // Use content-only search (already grouped by document with correct field names)
        searchResults = await searchDocumentsFunction(
          query,
          userId,
          organizationId,
          limit + (excludeCurrentDocument ? 2 : 0),
        )
      }

      // Filter out current document if currentDocumentId is provided
      if (excludeCurrentDocument) {
        searchResults = searchResults.filter((result) => result.documentId !== currentDocumentId)
      }

      // Filter by minimum similarity and process results
      const processedResults: any[] = []

      for (const result of searchResults) {
        if (result.contentChunks && result.contentChunks.length > 0) {
          // Filter content chunks by similarity using constant threshold
          const filteredChunks = result.contentChunks.filter(
            (chunk: any) => chunk.similarity >= MIN_SIMILARITY,
          )

          if (filteredChunks.length > 0) {
            processedResults.push({
              searchType: result.searchType,
              documentId: result.documentId,
              documentTitle: result.documentTitle,
              documentSlug: result.documentSlug,
              titleSimilarity: result.titleSimilarity,
              contentChunks: filteredChunks.slice(0, 3), // Limit chunks per document
            })
          }
        }
      }

      const finalResults = processedResults.slice(0, limit)

      if (finalResults.length === 0) {
        yield {
          message: "No relevant documents found for your search query.",
          results: [],
          searchQuery: query,
          searchStrategy,
        }
        return
      }

      // Format results for LLM consumption
      const formattedResults = finalResults.map((result) => ({
        documentId: result.documentId,
        documentTitle: result.documentTitle,
        documentSlug: result.documentSlug,
        searchType: result.searchType,
        titleSimilarity: result.titleSimilarity ? Math.round(result.titleSimilarity * 100) / 100 : undefined,
        relevantContent: result.contentChunks.map((chunk: any) => ({
          content: chunk.content,
          similarity: Math.round(chunk.similarity * 100) / 100,
        })),
      }))

      const strategyMessage =
        searchStrategy === "title_first"
          ? "by document titles"
          : searchStrategy === "content_first"
            ? "by document content"
            : "by titles and content"

      // Yield final result (this is what will be in tool.output)
      yield {
        message: `Found ${finalResults.length} relevant document${
          finalResults.length === 1 ? "" : "s"
        } ${strategyMessage}:`,
        results: formattedResults,
        searchQuery: query,
        searchStrategy,
        totalFound: finalResults.length,
      }
    },
  })
