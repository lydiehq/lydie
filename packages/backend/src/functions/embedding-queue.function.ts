import type { SQSEvent } from "aws-lambda";
import { drizzle } from "drizzle-orm/postgres-js";
import { Resource } from "sst";
import * as schema from "@lydie/database/schema";
import { relations } from "@lydie/database/relations";
import postgres from "postgres";
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";

// Pooled connection via pgBouncer for Lambda functions. Uses postgres-js
// as Bun is not supported in Lambda.
const pg = postgres(Resource.PostgresConnectionStringPooled.value);

const db = drizzle({
  client: pg,
  schema,
  relations,
});

/**
 * Lambda handler for processing embedding queue messages
 * Each message contains a documentId to process
 */
export const handler = async (event: SQSEvent) => {
  console.log(
    `Processing ${event.Records.length} message(s) from embedding queue`
  );

  const results = [];

  for (const record of event.Records) {
    try {
      const { documentId, queuedAt } = JSON.parse(record.body);

      console.log(
        `Processing embedding for document: ${documentId} (queued at ${new Date(
          queuedAt
        ).toISOString()})`
      );

      // Fetch the document
      const doc = await db.query.documentsTable.findFirst({
        where: {
          id: documentId,
        },
      });

      if (!doc) {
        console.warn(`Document ${documentId} not found, skipping`);
        results.push({ documentId, success: false, reason: "not_found" });
        continue;
      }

      // Check if document was modified after this message was queued
      // If so, there's a newer message coming, so skip this one
      const docUpdatedAt = new Date(doc.updatedAt).getTime();
      if (docUpdatedAt > queuedAt) {
        console.log(
          `Document ${documentId} was modified after message was queued (doc: ${new Date(
            docUpdatedAt
          ).toISOString()}, msg: ${new Date(
            queuedAt
          ).toISOString()}), skipping - newer message will process it`
        );
        results.push({ documentId, success: true, reason: "superseded" });
        continue;
      }

      // Check if document still needs indexing
      if (doc.indexStatus === "indexed" || doc.indexStatus === "indexing") {
        console.log(
          `Document ${documentId} is already ${doc.indexStatus}, skipping`
        );
        results.push({ documentId, success: true, reason: "already_indexed" });
        continue;
      }

      // Process the document
      await processDocumentEmbedding(doc, db);

      results.push({ documentId, success: true });
      console.log(
        `Successfully processed embeddings for document ${documentId}`
      );
    } catch (error) {
      console.error(`Error processing message:`, error);
      results.push({
        documentId: "unknown",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  console.log(
    `Completed batch: ${successCount} successful, ${failureCount} failed`
  );

  return {
    batchItemFailures: results
      .filter((r) => !r.success)
      .map((r) => ({ itemIdentifier: r.documentId })),
  };
};
