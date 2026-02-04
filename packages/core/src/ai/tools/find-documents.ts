import { tool } from "ai";
import { z } from "zod";

import {
  hybridSearchDocuments,
  searchDocuments as searchDocumentsFunction,
} from "../../embedding/search";

// Constant minimum similarity threshold
const MIN_SIMILARITY = 0.3;

const description = `
Find documents using semantic and hybrid search (searches both titles and content).

Returns ranked results with relevant content excerpts. Uses AI to understand topic/concept, not just keyword matching.

Supports parallel queries - include multiple questions in one call for efficiency.

Use for: semantic/topic discovery, "about X", "mentioning Y", finding information in unknown locations.
Not for: recency (use scan_documents), title-only patterns (use scan_documents), or reading full content (use read_document).
`;

export const findDocuments = (userId: string, organizationId: string, currentDocumentId?: string) =>
  tool({
    description,
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
      limit: z
        .number()
        .describe("The maximum number of results to return.")
        .min(1)
        .max(10)
        .default(5),
    }),
    execute: async function* ({ query, searchStrategy = "both", limit = 5 }) {
      // Yield initial searching state
      yield {
        state: "searching",
        message: `Finding documents about "${query}"...`,
        query,
      };

      const excludeCurrentDocument = !!currentDocumentId;

      let searchResults: any[] = [];

      if (searchStrategy === "title_first" || searchStrategy === "both") {
        // Use hybrid search for title-first or both strategies
        searchResults = await hybridSearchDocuments(
          query,
          userId,
          organizationId,
          searchStrategy,
          limit + (excludeCurrentDocument ? 3 : 0),
        );
      } else {
        // Use content-only search (already grouped by document with correct field names)
        searchResults = await searchDocumentsFunction(
          query,
          userId,
          organizationId,
          limit + (excludeCurrentDocument ? 2 : 0),
        );
      }

      // Filter out current document if currentDocumentId is provided
      if (excludeCurrentDocument) {
        searchResults = searchResults.filter((result) => result.documentId !== currentDocumentId);
      }

      // Filter by minimum similarity and process results
      const processedResults: any[] = [];

      for (const result of searchResults) {
        if (result.contentChunks && result.contentChunks.length > 0) {
          // Filter content chunks by similarity using constant threshold
          const filteredChunks = result.contentChunks.filter(
            (chunk: any) => chunk.similarity >= MIN_SIMILARITY,
          );

          if (filteredChunks.length > 0) {
            processedResults.push({
              searchType: result.searchType,
              documentId: result.documentId,
              documentTitle: result.documentTitle,
              documentSlug: result.documentSlug,
              titleSimilarity: result.titleSimilarity,
              contentChunks: filteredChunks.slice(0, 3), // Limit chunks per document
            });
          }
        }
      }

      const finalResults = processedResults.slice(0, limit);

      if (finalResults.length === 0) {
        yield {
          message: "No relevant documents found for your query.",
          results: [],
          searchQuery: query,
          searchStrategy,
        };
        return;
      }

      // Format results for LLM consumption
      const formattedResults = finalResults.map((result) => ({
        documentId: result.documentId,
        documentTitle: result.documentTitle,
        documentSlug: result.documentSlug,
        searchType: result.searchType,
        titleSimilarity: result.titleSimilarity
          ? Math.round(result.titleSimilarity * 100) / 100
          : undefined,
        relevantContent: result.contentChunks.map((chunk: any) => ({
          content: chunk.content,
          similarity: Math.round(chunk.similarity * 100) / 100,
        })),
      }));

      const strategyMessage =
        searchStrategy === "title_first"
          ? "by document titles"
          : searchStrategy === "content_first"
            ? "by document content"
            : "by titles and content";

      // Yield final result (this is what will be in tool.output)
      yield {
        message: `Found ${finalResults.length} relevant document${
          finalResults.length === 1 ? "" : "s"
        } ${strategyMessage}:`,
        results: formattedResults,
        searchQuery: query,
        searchStrategy,
        totalFound: finalResults.length,
      };
    },
  });
