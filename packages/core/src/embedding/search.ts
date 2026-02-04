import {
  db,
  documentEmbeddingsTable,
  documentTitleEmbeddingsTable,
  documentsTable,
  templatesTable,
} from "@lydie/database";
import { and, eq, sql } from "drizzle-orm";

import { generateEmbedding, generateTitleEmbedding } from "./generation";

export async function storeTitleEmbedding(documentId: string, title: string) {
  try {
    const embedding = await generateTitleEmbedding(title);

    await db
      .delete(documentTitleEmbeddingsTable)
      .where(eq(documentTitleEmbeddingsTable.documentId, documentId));

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

export async function searchDocumentsByTitle(
  query: string,
  userId: string,
  organizationId: string,
  limit: number = 10,
) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const similarity = sql<number>`1 - (${
      documentTitleEmbeddingsTable.embedding
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
      .innerJoin(documentsTable, eq(documentTitleEmbeddingsTable.documentId, documentsTable.id))
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          sql`${documentsTable.deletedAt} IS NULL`,
          sql`(${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(
            queryEmbedding,
          )}::vector) < 0.7`,
        ),
      )
      .orderBy(
        sql`${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`,
      )
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in searchDocumentsByTitle:", error);
    throw error;
  }
}

export async function hybridSearchDocuments(
  query: string,
  userId: string,
  organizationId: string,
  searchStrategy: "title_first" | "content_first" | "both" = "both",
  limit: number = 5,
) {
  try {
    const results: any[] = [];

    if (searchStrategy === "title_first" || searchStrategy === "both") {
      const titleResults = await searchDocumentsByTitle(
        query,
        userId,
        organizationId,
        Math.min(limit, 5),
      );

      for (const titleResult of titleResults) {
        const contentResults = await searchDocumentsInSpecificDocument(
          query,
          titleResult.id,
          Math.min(3, limit),
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
      const contentResults = await searchDocuments(
        query,
        userId,
        organizationId,
        limit - results.length,
      );

      for (const contentResult of contentResults) {
        const existingResult = results.find((r) => r.documentId === contentResult.documentId);
        if (existingResult) {
          if (contentResult.contentChunks) {
            existingResult.contentChunks = existingResult.contentChunks || [];
            existingResult.contentChunks.push(...contentResult.contentChunks);
          }
        } else {
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

export async function searchDocumentsInSpecificDocument(
  query: string,
  documentId: string,
  limit: number = 3,
) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const similarity = sql<number>`1 - (${
      documentEmbeddingsTable.embedding
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
          sql`(${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) < 0.6`,
        ),
      )
      .orderBy(
        sql`${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`,
      )
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in searchDocumentsInSpecificDocument:", error);
    throw error;
  }
}

export async function findRelatedDocuments(
  documentId: string,
  organizationId: string,
  limit: number = 5,
) {
  try {
    const [titleEmbedding] = await db
      .select({
        embedding: documentTitleEmbeddingsTable.embedding,
      })
      .from(documentTitleEmbeddingsTable)
      .where(eq(documentTitleEmbeddingsTable.documentId, documentId))
      .limit(1);

    if (!titleEmbedding) {
      return await findRelatedDocumentsByContent(documentId, organizationId, limit);
    }

    const queryEmbedding = titleEmbedding.embedding;

    const similarity = sql<number>`1 - (${
      documentTitleEmbeddingsTable.embedding
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
      .innerJoin(documentsTable, eq(documentTitleEmbeddingsTable.documentId, documentsTable.id))
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.published, true),
          sql`${documentsTable.deletedAt} IS NULL`,
          sql`${documentsTable.id} != ${documentId}`,
          sql`(${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(
            queryEmbedding,
          )}::vector) < 0.8`,
        ),
      )
      .orderBy(
        sql`${documentTitleEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`,
      )
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in findRelatedDocuments:", error);
    throw error;
  }
}

export async function findRelatedDocumentsByContent(
  documentId: string,
  organizationId: string,
  limit: number = 5,
) {
  try {
    const [contentEmbedding] = await db
      .select({
        embedding: documentEmbeddingsTable.embedding,
      })
      .from(documentEmbeddingsTable)
      .where(eq(documentEmbeddingsTable.documentId, documentId))
      .limit(1);

    if (!contentEmbedding) {
      return [];
    }

    const queryEmbedding = contentEmbedding.embedding;

    const similarity = sql<number>`1 - (${
      documentEmbeddingsTable.embedding
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
      .innerJoin(documentsTable, eq(documentEmbeddingsTable.documentId, documentsTable.id))
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.published, true),
          sql`${documentsTable.deletedAt} IS NULL`,
          sql`${documentsTable.id} != ${documentId}`,
          sql`(${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) < 0.6`,
        ),
      )
      .groupBy(
        documentsTable.id,
        documentsTable.title,
        documentsTable.slug,
        documentsTable.createdAt,
        documentsTable.updatedAt,
      )
      .orderBy(sql`MAX(${similarity}) DESC`)
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in findRelatedDocumentsByContent:", error);
    throw error;
  }
}

export async function searchDocuments(
  query: string,
  userId: string,
  organizationId: string,
  limit: number = 5,
) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const similarity = sql<number>`1 - (${
      documentEmbeddingsTable.embedding
    } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

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
      .innerJoin(documentsTable, eq(documentEmbeddingsTable.documentId, documentsTable.id))
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          sql`${documentsTable.deletedAt} IS NULL`,
          sql`(${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) < 0.5`,
        ),
      )
      .orderBy(
        sql`${documentEmbeddingsTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`,
      )
      .limit(limit * 3);

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

    return Array.from(documentMap.values()).slice(0, limit);
  } catch (error) {
    console.error("Error in searchDocuments:", error);
    throw error;
  }
}

export async function findRelatedTemplates(templateId: string, limit: number = 6) {
  try {
    const [template] = await db
      .select({
        titleEmbedding: templatesTable.titleEmbedding,
      })
      .from(templatesTable)
      .where(eq(templatesTable.id, templateId))
      .limit(1);

    if (!template || !template.titleEmbedding) {
      return [];
    }

    const queryEmbedding = template.titleEmbedding;

    const similarity = sql<number>`1 - (${templatesTable.titleEmbedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    const results = await db
      .select({
        id: templatesTable.id,
        name: templatesTable.name,
        slug: templatesTable.slug,
        teaser: templatesTable.teaser,
        thumbnailSrc: templatesTable.thumbnailSrc,
        similarity,
        createdAt: templatesTable.createdAt,
        updatedAt: templatesTable.updatedAt,
      })
      .from(templatesTable)
      .where(
        and(
          sql`${templatesTable.id} != ${templateId}`,
          sql`${templatesTable.titleEmbedding} IS NOT NULL`,
          sql`(${templatesTable.titleEmbedding} <=> ${JSON.stringify(queryEmbedding)}::vector) < 0.8`,
        ),
      )
      .orderBy(sql`${templatesTable.titleEmbedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Error in findRelatedTemplates:", error);
    throw error;
  }
}
