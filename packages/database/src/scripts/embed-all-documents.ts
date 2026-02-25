import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";

import { db } from "../index";

async function embedAllDocuments() {
  console.log(`📦 Environment: ${process.env.APP_STAGE || "development"}`);
  console.log(`🚀 Starting to embed all documents...`);
  console.log(`🔌 Connecting to database...`);

  // Fetch all documents
  const documents = await db.query.documentsTable.findMany({
    orderBy: (documents, { asc }) => [asc(documents.createdAt)],
  });

  console.log(`📄 Found ${documents.length} document(s) to process\n`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of documents) {
    try {
      // processDocumentEmbedding handles empty yjsState gracefully
      const result = await processDocumentEmbedding(
        {
          documentId: doc.id,
          yjsState: doc.yjsState,
        },
        db,
      );
      if (result.skipped) {
        skipped++;
      } else {
        processed++;
      }
      const progress = `${processed + skipped + failed}/${documents.length}`;
      console.log(
        `📊 Progress: ${progress} (✅ ${processed} processed, ⏭️  ${skipped} skipped, ❌ ${failed} failed)`,
      );
    } catch (error) {
      failed++;
      console.error(`❌ Error processing document ${doc.id} (${doc.title}):`, error);
      const progress = `${processed + skipped + failed}/${documents.length}`;
      console.log(
        `📊 Progress: ${progress} (✅ ${processed} processed, ⏭️  ${skipped} skipped, ❌ ${failed} failed)`,
      );
    }
  }

  console.log(`\n✅ Completed!`);
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total: ${documents.length}`);
}

embedAllDocuments().catch((error) => {
  console.error("❌ Error embedding documents:", error);
  process.exit(1);
});
