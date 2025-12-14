/**
 * Embedding module - Unified entry point for all embedding functionality
 */

// Generation utilities
export {
  embeddingModel,
  generateEmbedding,
  generateTitleEmbedding,
  generateManyEmbeddings,
} from "./generation";

// Chunking utilities
export {
  generateHeadingAwareChunks,
  generateSimpleChunks,
  type Chunk,
} from "./chunking";

// Document processing
export { processDocumentEmbedding } from "./document-processing";

// Search utilities
export {
  storeTitleEmbedding,
  searchDocumentsByTitle,
  hybridSearchDocuments,
  searchDocumentsInSpecificDocument,
  findRelatedDocuments,
  findRelatedDocumentsByContent,
  searchDocuments,
} from "./search";

