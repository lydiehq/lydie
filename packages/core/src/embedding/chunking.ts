/**
 * Enhanced chunking strategy for document embeddings
 *
 * This module provides heading-aware chunking that creates more meaningful
 * semantic chunks by respecting document structure (headings, sections).
 */

import { serializeToHTML } from "../serialization/html";
import { serializeToPlainText } from "../serialization/text";

export interface Chunk {
  content: string;
  heading?: string;
  level?: number;
  index: number;
}

/**
 * Extract content with headings from TipTap JSON structure
 * Returns HTML-formatted content for better LLM readability
 */
function extractContentWithHeadings(jsonContent: any): Array<{
  type: "heading" | "content";
  htmlContent: string;
  plainText: string;
  level?: number;
}> {
  const items: Array<{
    type: "heading" | "content";
    htmlContent: string;
    plainText: string;
    level?: number;
  }> = [];

  if (!jsonContent || typeof jsonContent !== "object") {
    return items;
  }

  function traverse(node: any) {
    if (!node || typeof node !== "object") return;

    // Handle heading nodes
    if (node.type === "heading" && node.content) {
      const headingHtml = serializeToHTML(node);
      const plainText = serializeToPlainText(node);

      if (plainText.trim()) {
        items.push({
          type: "heading",
          htmlContent: headingHtml,
          plainText: plainText.trim(),
          level: node.attrs?.level || 1,
        });
      }
    }
    // Handle paragraph and other block nodes
    else if (
      node.type === "paragraph" ||
      node.type === "bulletList" ||
      node.type === "orderedList"
    ) {
      const contentHtml = serializeToHTML(node);
      const plainText = serializeToPlainText(node);

      if (plainText.trim()) {
        items.push({
          type: "content",
          htmlContent: contentHtml,
          plainText: plainText.trim(),
        });
      }
    }

    // For document root, traverse children
    if (node.type === "doc" && node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(jsonContent);
  return items;
}

/**
 * Strip HTML tags to get plain text (for length calculations)
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate heading-aware chunks from TipTap JSON content *
 *
 * Strategy:
 * 1. Group paragraphs under their parent headings
 * 2. Split large sections into smaller chunks while preserving heading context
 * 3. Each chunk includes the heading it belongs to for better context
 */
export function generateHeadingAwareChunks(
  jsonContent: any,
  maxChunkSize: number = 500,
  minChunkSize: number = 50
): Chunk[] {
  const items = extractContentWithHeadings(jsonContent);
  const chunks: Chunk[] = [];

  let currentHeading: string | undefined;
  let currentLevel: number | undefined;
  let currentChunkHtml: string[] = [];
  let chunkIndex = 0;

  function flushChunk() {
    if (currentChunkHtml.length === 0) return;

    // Join HTML content (LLM will see clean HTML)
    const htmlContent = currentChunkHtml.join("\n");

    // Check length using plain text (without HTML tags)
    // Note: We still use stripHtmlTags here because we're working with HTML strings,
    // not TipTap nodes. For TipTap nodes, use serializeToPlainText instead.
    const plainTextLength = stripHtmlTags(htmlContent).length;

    if (plainTextLength >= minChunkSize) {
      chunks.push({
        content: htmlContent, // Store HTML for LLM readability
        heading: currentHeading,
        level: currentLevel,
        index: chunkIndex++,
      });
    }
    currentChunkHtml = [];
  }

  for (const item of items) {
    if (item.type === "heading") {
      // Flush previous chunk before starting new section
      flushChunk();

      // Update current heading context (use plain text for metadata)
      currentHeading = item.plainText;
      currentLevel = item.level;

      // Start new chunk with heading HTML
      currentChunkHtml.push(item.htmlContent);
    } else {
      // Calculate combined length using plain text
      const currentPlainLength = stripHtmlTags(
        currentChunkHtml.join("\n")
      ).length;
      const itemPlainLength = item.plainText.length;
      const combinedLength = currentPlainLength + itemPlainLength;

      if (combinedLength > maxChunkSize && currentChunkHtml.length > 0) {
        // Current chunk is full, flush it
        flushChunk();

        // Start new chunk with same heading context
        currentChunkHtml.push(item.htmlContent);
      } else {
        // Add to current chunk
        currentChunkHtml.push(item.htmlContent);
      }
    }
  }

  // Flush remaining content
  flushChunk();

  return chunks;
}

/**
 * Fallback chunking for when JSON parsing fails
 * This is the original paragraph-based chunking
 */
export function generateSimpleChunks(
  text: string,
  maxChunkSize: number = 300
): Chunk[] {
  // Split text into paragraphs first (split by double newlines)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  const chunks: string[] = [];

  // If a paragraph is too long, split it into sentences
  paragraphs.forEach((paragraph) => {
    if (paragraph.length <= maxChunkSize) {
      chunks.push(paragraph.trim());
    } else {
      // For longer paragraphs, split into sentences but keep some context
      const sentences = paragraph.split(/(?<=\.|\?|\!)\s+/);
      let currentChunk = "";

      sentences.forEach((sentence) => {
        if ((currentChunk + " " + sentence).length <= maxChunkSize) {
          currentChunk = (currentChunk + " " + sentence).trim();
        } else {
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          currentChunk = sentence.trim();
        }
      });

      if (currentChunk) {
        chunks.push(currentChunk);
      }
    }
  });

  return chunks
    .filter((chunk) => chunk.length > 20)
    .map((content, index) => ({
      content,
      index,
    }));
}
