import { db } from "@lydie/database";
import { Resource } from "sst";
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";

async function embedAllDocuments() {
  // Check if we're in production
  console.log(`Environment: ${Resource.App.stage}`);
  console.log(`Starting to embed all documents...`);
  console.log(`Connecting to database...`);

  // Fetch all documents
  const documents = await db.query.documentsTable.findMany({
    orderBy: (documents, { asc }) => [asc(documents.createdAt)],
  });

  console.log(`Found ${documents.length} document(s) to process`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of documents) {
    try {
      const result = await processDocumentEmbedding(doc, db);
      if (result.skipped) {
        skipped++;
      } else {
        processed++;
      }
      console.log(
        `Progress: ${processed + skipped + failed}/${
          documents.length
        } (${processed} processed, ${skipped} skipped, ${failed} failed)`
      );
    } catch (error) {
      failed++;
      console.error(
        `Error processing document ${doc.id} (${doc.title}):`,
        error
      );
      console.log(
        `Progress: ${processed + skipped + failed}/${
          documents.length
        } (${processed} processed, ${skipped} skipped, ${failed} failed)`
      );
    }
  }

  console.log(`\n✅ Completed!`);
  console.log(`  - Processed: ${processed}`);
  console.log(`  - Skipped: ${skipped}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Total: ${documents.length}`);
}

embedAllDocuments().catch((error) => {
  console.error("Error embedding documents:", error);
  process.exit(1);
});
