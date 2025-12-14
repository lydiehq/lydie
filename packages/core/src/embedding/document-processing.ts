/**
 * Document embedding processing utilities
 *
 * This module provides functions for processing documents to generate embeddings
 * for semantic search and retrieval.
 */

import {
  db,
  documentsTable,
  documentEmbeddingsTable,
  documentTitleEmbeddingsTable,
} from "@lydie/database";
import { eq } from "drizzle-orm";
import { generateContentHash } from "../hash";
import { convertTipTapToPlaintext } from "../utils";
import { generateHeadingAwareChunks, generateSimpleChunks } from "./chunking";
import { generateTitleEmbedding, generateManyEmbeddings } from "./generation";

/**
 * Process a document to generate embeddings for title and content.
 * This function handles:
 * - Checking if title/content changed
 * - Generating title embeddings
 * - Generating content embeddings with heading-aware chunking
 * - Updating the document's index status
 *
 * @param doc - The document to process
 * @returns Promise with result indicating if processing was skipped
 */
export async function processDocumentEmbedding(
  doc: typeof documentsTable.$inferSelect
): Promise<{ skipped: boolean; reason?: string }> {
  // Convert TipTap JSON to plaintext for consistent hashing and embedding
  const plaintextContent = convertTipTapToPlaintext(doc.jsonContent);
  const currentContentHash = generateContentHash(plaintextContent);
  const titleChanged = doc.lastIndexedTitle !== doc.title;
  const contentChanged = doc.lastIndexedContentHash !== currentContentHash;

  // If nothing changed, skip processing
  if (!titleChanged && !contentChanged) {
    console.log(`Document ${doc.id} has no changes, skipping processing`);
    await db
      .update(documentsTable)
      .set({ indexStatus: "indexed" })
      .where(eq(documentsTable.id, doc.id));
    return { skipped: true, reason: "no_changes" };
  }

  console.log(
    `Processing document ${doc.id} - Title changed: ${titleChanged}, Content changed: ${contentChanged}`
  );

  // Use transaction for better performance and consistency
  await db
    .transaction(async (tx) => {
      // Set status to indexing
      await tx
        .update(documentsTable)
        .set({ indexStatus: "indexing", updatedAt: new Date() })
        .where(eq(documentsTable.id, doc.id));

      // Update title embedding only if title changed
      if (titleChanged) {
        console.log(`Updating title embedding for document ${doc.id}`);

        // Delete existing title embeddings
        await tx
          .delete(documentTitleEmbeddingsTable)
          .where(eq(documentTitleEmbeddingsTable.documentId, doc.id));

        // Generate new title embedding (fast operation)
        const titleEmbedding = await generateTitleEmbedding(doc.title);

        // Insert title embedding
        await tx.insert(documentTitleEmbeddingsTable).values({
          documentId: doc.id,
          title: doc.title,
          embedding: titleEmbedding,
        });
      }

      // Update content embeddings only if content changed
      if (contentChanged) {
        console.log(`Updating content embeddings for document ${doc.id}`);

        // Delete existing content embeddings
        await tx
          .delete(documentEmbeddingsTable)
          .where(eq(documentEmbeddingsTable.documentId, doc.id));

        // Generate heading-aware chunks from JSON content (expensive operation)
        let chunks;
        try {
          chunks = generateHeadingAwareChunks(doc.jsonContent);
          console.log(
            `Generated ${chunks.length} heading-aware chunks for document ${doc.id}`
          );
        } catch (error) {
          console.warn(
            `Failed to generate heading-aware chunks for document ${doc.id}, falling back to simple chunking`,
            error
          );
          // Fallback to simple text-based chunking
          const fullText = `${doc.title}\n\n${plaintextContent}`;
          chunks = generateSimpleChunks(fullText);
        }

        // Generate embeddings for all chunks
        if (chunks.length > 0) {
          const chunkTexts = chunks.map((c) => c.content);
          const embeddings = await generateManyEmbeddings(chunkTexts);

          // Insert content embeddings in batch with metadata
          await tx.insert(documentEmbeddingsTable).values(
            chunks.map((chunk, i) => ({
              content: chunk.content,
              embedding: embeddings[i]!,
              documentId: doc.id,
              chunkIndex: chunk.index,
              heading: chunk.heading,
              headingLevel: chunk.level,
            }))
          );
        }
      }

      // Mark as indexed and update tracking fields
      await tx
        .update(documentsTable)
        .set({
          indexStatus: "indexed",
          updatedAt: new Date(),
          lastIndexedTitle: doc.title,
          lastIndexedContentHash: currentContentHash,
        })
        .where(eq(documentsTable.id, doc.id));

      console.log(
        `Successfully processed document ${doc.id} - Updated: ${
          titleChanged ? "title" : ""
        } ${contentChanged ? "content" : ""}`
      );
    })
    .catch(async (error) => {
      // If transaction fails, mark document as failed outside transaction
      await db
        .update(documentsTable)
        .set({ indexStatus: "failed", updatedAt: new Date() })
        .where(eq(documentsTable.id, doc.id));

      throw error;
    });

  return { skipped: false };
}
