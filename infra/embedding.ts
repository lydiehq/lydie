/// <reference path="../.sst/platform/config.d.ts" />
import { secret } from "./secret";

// SQS Queue for debounced embedding generation Using standard queue (not FIFO)
// to support DelaySeconds (used in server-mutators.ts)
export const embeddingQueue = new sst.aws.Queue("EmbeddingQueue", {
  visibilityTimeout: "10 minutes",
});

// Subscribe to the embedding queue to process embeddings after 5-minute debounce
embeddingQueue.subscribe(
  {
    handler: "packages/backend/src/functions/embedding-queue.function.handler",
    timeout: "5 minutes",
    link: [
      secret.postgresConnectionStringPooled,
      secret.postgresConnectionStringDirect,
      secret.googleAiStudioApiKey,
      secret.openAiApiKey,
    ],
  },
  {
    batch: {
      size: 1, // Process one document at a time
      window: "0 seconds",
    },
  }
);
