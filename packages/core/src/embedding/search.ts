/**
 * Document search utilities using semantic embeddings
 */

import {
  db,
  documentEmbeddingsTable,
  documentsTable,
  documentTitleEmbeddingsTable,
} from "@lydie/database";
import { eq, sql, and } from "drizzle-orm";
import { generateEmbedding, generateTitleEmbedding } from "./generation";

// Store title embedding for a document
export async function storeTitleEmbedding(documentId: string, title: string) {
  try {
    const embedding = await generateTitleEmbedding(title);

    // First, delete any existing title embedding for this document
    await db
      .delete(documentTitleEmbeddingsTable)
      .where(eq(documentTitleEmbeddingsTable.documentId, documentId));

    // Insert new title embedding
    await db.insert(documentTitleEmbeddingsTable).values({
      documentId,
      title,
      embedding,
    });
  } catch (error) {
    console.error("Error storing title embedding:", error);
    throw error;
  }
}

// Search documents by title using semantic search
export async function searchDocumentsByTitle(
  query: string,
  userId: string,
  organizationId: string,
  limit: number = 10
) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Calculate cosine similarity for titles
    const similarity = sql<number>`1 - (${documentTitleEmbeddingsTable.embedding
      } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    const results = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        similarity,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentTitleEmbeddingsTable)
      .innerJoin(
        documentsTable,
        eq(documentTitleEmbeddingsTable.documentId, documentsTable.id)
      )
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          // More lenient similarity threshold for titles
          sql`(${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(
            queryEmbedding
          )}::vector) < 0.7`
        )
      )
      .orderBy(
        sql`${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(
          queryEmbedding
        )}::vector`
      )
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in searchDocumentsByTitle:", error);
    throw error;
  }
}

// Hybrid search: first by title, then by content
export async function hybridSearchDocuments(
  query: string,
  userId: string,
  organizationId: string,
  searchStrategy: "title_first" | "content_first" | "both" = "both",
  limit: number = 5
) {
  try {
    const results: any[] = [];

    if (searchStrategy === "title_first" || searchStrategy === "both") {
      // First, search by titles
      const titleResults = await searchDocumentsByTitle(
        query,
        userId,
        organizationId,
        Math.min(limit, 5)
      );

      // For each matching document, get some content
      for (const titleResult of titleResults) {
        const contentResults = await searchDocumentsInSpecificDocument(
          query,
          titleResult.id,
          Math.min(3, limit)
        );

        results.push({
          searchType: "title_match",
          documentId: titleResult.id,
          documentTitle: titleResult.title,
          documentSlug: titleResult.slug,
          titleSimilarity: titleResult.similarity,
          contentChunks: contentResults,
        });
      }
    }

    if (
      (searchStrategy === "content_first" || searchStrategy === "both") &&
      results.length < limit
    ) {
      // Then search content if we need more results
      const contentResults = await searchDocuments(
        query,
        userId,
        organizationId,
        limit - results.length
      );

      for (const contentResult of contentResults) {
        // Check if we already have this document from title search
        const existingResult = results.find(
          (r) => r.documentId === contentResult.documentId
        );
        if (existingResult) {
          // Merge content chunks from content search
          if (contentResult.contentChunks) {
            existingResult.contentChunks = existingResult.contentChunks || [];
            existingResult.contentChunks.push(...contentResult.contentChunks);
          }
        } else {
          // New document from content search
          results.push(contentResult);
        }
      }
    }

    return results.slice(0, limit);
  } catch (error) {
    console.error("Error in hybridSearchDocuments:", error);
    throw error;
  }
}

// Search content within a specific document
export async function searchDocumentsInSpecificDocument(
  query: string,
  documentId: string,
  limit: number = 3
) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const similarity = sql<number>`1 - (${documentEmbeddingsTable.embedding
      } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    const results = await db
      .select({
        content: documentEmbeddingsTable.content,
        similarity,
        headerBreadcrumb: documentEmbeddingsTable.headerBreadcrumb,
      })
      .from(documentEmbeddingsTable)
      .where(
        and(
          eq(documentEmbeddingsTable.documentId, documentId),
          sql`(${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(
            queryEmbedding
          )}::vector) < 0.6`
        )
      )
      .orderBy(
        sql`${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(
          queryEmbedding
        )}::vector`
      )
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in searchDocumentsInSpecificDocument:", error);
    throw error;
  }
}

// Find related documents based on a document's title and content embeddings
export async function findRelatedDocuments(
  documentId: string,
  organizationId: string,
  limit: number = 5
) {
  try {
    // Get the current document's title embedding
    const titleEmbedding = await db
      .select({
        embedding: documentTitleEmbeddingsTable.embedding,
      })
      .from(documentTitleEmbeddingsTable)
      .where(eq(documentTitleEmbeddingsTable.documentId, documentId))
      .limit(1);

    if (titleEmbedding.length === 0) {
      // If no title embedding exists, fall back to content-based similarity
      return await findRelatedDocumentsByContent(
        documentId,
        organizationId,
        limit
      );
    }

    const queryEmbedding = titleEmbedding[0].embedding;

    // Find similar documents by title, excluding the current document
    const similarity = sql<number>`1 - (${documentTitleEmbeddingsTable.embedding
      } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    const results = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        similarity,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentTitleEmbeddingsTable)
      .innerJoin(
        documentsTable,
        eq(documentTitleEmbeddingsTable.documentId, documentsTable.id)
      )
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.published, true),
          // Exclude the current document
          sql`${documentsTable.id} != ${documentId}`,
          // Reasonable similarity threshold
          sql`(${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(
            queryEmbedding
          )}::vector) < 0.8`
        )
      )
      .orderBy(
        sql`${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(
          queryEmbedding
        )}::vector`
      )
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in findRelatedDocuments:", error);
    throw error;
  }
}

// Fallback method using content embeddings when title embeddings aren't available
export async function findRelatedDocumentsByContent(
  documentId: string,
  organizationId: string,
  limit: number = 5
) {
  try {
    // Get a representative content embedding from the document (we'll use the first one)
    const contentEmbedding = await db
      .select({
        embedding: documentEmbeddingsTable.embedding,
      })
      .from(documentEmbeddingsTable)
      .where(eq(documentEmbeddingsTable.documentId, documentId))
      .limit(1);

    if (contentEmbedding.length === 0) {
      return [];
    }

    const queryEmbedding = contentEmbedding[0].embedding;

    // Find documents with similar content, grouped by document
    const similarity = sql<number>`1 - (${documentEmbeddingsTable.embedding
      } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    const results = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        similarity: sql<number>`MAX(${similarity})`.as("max_similarity"),
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentEmbeddingsTable)
      .innerJoin(
        documentsTable,
        eq(documentEmbeddingsTable.documentId, documentsTable.id)
      )
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.published, true),
          // Exclude the current document
          sql`${documentsTable.id} != ${documentId}`,
          // Reasonable similarity threshold
          sql`(${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(
            queryEmbedding
          )}::vector) < 0.6`
        )
      )
      .groupBy(
        documentsTable.id,
        documentsTable.title,
        documentsTable.slug,
        documentsTable.createdAt,
        documentsTable.updatedAt
      )
      .orderBy(sql`MAX(${similarity}) DESC`)
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in findRelatedDocumentsByContent:", error);
    throw error;
  }
}

// Original semantic search across user's documents (content-only)
// Returns documents grouped with their matching content chunks
export async function searchDocuments(
  query: string,
  userId: string,
  organizationId: string,
  limit: number = 5
) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Calculate cosine similarity - using the vector <=> operator for cosine distance
    const similarity = sql<number>`1 - (${documentEmbeddingsTable.embedding
      } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    // Get more chunks than documents needed so we can group properly
    const chunkResults = await db
      .select({
        content: documentEmbeddingsTable.content,
        similarity,
        title: documentsTable.title,
        id: documentsTable.id,
        slug: documentsTable.slug,
        headerBreadcrumb: documentEmbeddingsTable.headerBreadcrumb,
      })
      .from(documentEmbeddingsTable)
      .innerJoin(
        documentsTable,
        eq(documentEmbeddingsTable.documentId, documentsTable.id)
      )
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          // Only return results with reasonable similarity
          sql`(${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(
            queryEmbedding
          )}::vector) < 0.5`
        )
      )
      .orderBy(
        sql`${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(
          queryEmbedding
        )}::vector`
      )
      .limit(limit * 3); // Get more chunks to ensure we have enough documents

    // Group chunks by document
    const documentMap = new Map<string, any>();

    for (const result of chunkResults) {
      if (!documentMap.has(result.id)) {
        documentMap.set(result.id, {
          searchType: "content_match",
          documentId: result.id,
          documentTitle: result.title,
          documentSlug: result.slug,
          contentChunks: [],
        });
      }

      documentMap.get(result.id)!.contentChunks.push({
        content: result.content,
        similarity: result.similarity,
        headerBreadcrumb: result.headerBreadcrumb,
      });
    }

    // Return only the requested number of documents
    return Array.from(documentMap.values()).slice(0, limit);
  } catch (error) {
    console.error("Error in searchDocuments:", error);
    throw error;
  }
}
