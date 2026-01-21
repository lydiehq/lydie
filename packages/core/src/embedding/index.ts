/**
 * Embedding module - Unified entry point for all embedding functionality
 */

// Generation utilities
export {
  embeddingModel,
  generateEmbedding,
  generateTitleEmbedding,
  generateManyEmbeddings,
} from "./generation"

// Chunking utilities
export {
  generateHeadingAwareChunks,
  generateSimpleChunks,
  generateParagraphChunks,
  type Chunk,
  type ParagraphChunk,
} from "./chunking"

// Document processing
export { processDocumentEmbedding } from "./document-processing"

// Title processing
export { processDocumentTitleEmbedding } from "./title-processing"

// Search utilities
export {
  storeTitleEmbedding,
  searchDocumentsByTitle,
  hybridSearchDocuments,
  searchDocumentsInSpecificDocument,
  findRelatedDocuments,
  findRelatedDocumentsByContent,
  searchDocuments,
} from "./search"
