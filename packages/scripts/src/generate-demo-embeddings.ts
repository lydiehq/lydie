import { demoContent } from "../../zero/src/demo-content";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import {
  generateParagraphChunks,
  generateSimpleChunks,
} from "@lydie/core/embedding/chunking";
import { generateManyEmbeddings, generateTitleEmbedding } from "@lydie/core/embedding/generation";
import { serializeToPlainText } from "@lydie/core/serialization/text";
import { extractSections } from "@lydie/core/embedding/section-hashing";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentNode } from "@lydie/core/content";

/**
 * Normalize content by converting taskList/taskItem to bulletList/listItem
 * since taskList/taskItem are not in the ProseMirror schema
 */
function normalizeContentForYjs(content: any): ContentNode {
  if (!content || typeof content !== "object") {
    return content;
  }

  // Recursively process the content tree
  if (Array.isArray(content)) {
    return content.map(normalizeContentForYjs) as any;
  }

  if (content.type === "taskList") {
    return {
      ...content,
      type: "bulletList",
      content: content.content
        ? (content.content as any[]).map(normalizeContentForYjs)
        : undefined,
    };
  }

  if (content.type === "taskItem") {
    return {
      ...content,
      type: "listItem",
      content: content.content
        ? (content.content as any[]).map(normalizeContentForYjs)
        : undefined,
    };
  }

  // Recursively process children
  if (content.content && Array.isArray(content.content)) {
    return {
      ...content,
      content: content.content.map(normalizeContentForYjs),
    };
  }

  return content;
}

interface EmbeddingData {
  contentEmbeddings: Array<{
    content: string;
    embedding: number[];
    chunkIndex: number | null;
    heading: string | null;
    headingLevel: number | null;
    headerBreadcrumb: string | null;
  }>;
  titleEmbedding: number[];
}

async function generateEmbeddingsForDemoContent() {
  console.log("Generating embeddings for demo content...");
  const embeddings: Record<string, EmbeddingData> = {};

  for (const doc of demoContent) {
    console.log(`Processing: ${doc.title}`);
    
    try {
      // Convert taskList/taskItem to bulletList/listItem since they're not in the schema
      const normalizedContent = normalizeContentForYjs(doc.content);
      
      // Convert JSON to Yjs and back to ensure consistent processing
      const yjsState = convertJsonToYjs(normalizedContent);
      if (!yjsState) {
        console.warn(`Failed to convert ${doc.title} to Yjs, skipping`);
        continue;
      }

      const jsonContent = convertYjsToJson(yjsState);
      if (!jsonContent) {
        console.warn(`Failed to convert ${doc.title} from Yjs, skipping`);
        continue;
      }

      // Generate title embedding
      const titleEmbedding = await generateTitleEmbedding(doc.title);

      // Process content embeddings
      const sections = extractSections(jsonContent);
      let chunks: any[] = [];

      if (sections.length === 0) {
        // Fall back to simple chunking
        const plaintextContent = serializeToPlainText(jsonContent as any);
        chunks = generateSimpleChunks(plaintextContent);
      } else {
        // Use paragraph chunks
        try {
          chunks = generateParagraphChunks(jsonContent);
        } catch (error) {
          console.warn(
            `Failed to generate paragraph chunks for ${doc.title}, falling back to simple chunking`,
            error
          );
          const plaintextContent = serializeToPlainText(jsonContent);
          chunks = generateSimpleChunks(plaintextContent);
        }
      }

      // Generate embeddings for chunks
      const chunkTexts = chunks.map((c) => c.content);
      const chunkEmbeddings = await generateManyEmbeddings(chunkTexts);

      // Map chunks to embedding data
      const contentEmbeddings = chunks.map((chunk, i) => ({
        content: chunk.content,
        embedding: chunkEmbeddings[i]!,
        chunkIndex: chunk.index ?? null,
        heading:
          "headerPath" in chunk
            ? chunk.headerPath[chunk.headerPath.length - 1] ?? null
            : (chunk as any).heading ?? null,
        headingLevel:
          "headerLevels" in chunk
            ? chunk.headerLevels[chunk.headerLevels.length - 1] ?? null
            : (chunk as any).level ?? null,
        headerBreadcrumb:
          "headerBreadcrumb" in chunk ? chunk.headerBreadcrumb : null,
      }));

      embeddings[doc.title] = {
        contentEmbeddings,
        titleEmbedding,
      };

      console.log(`✓ Generated ${contentEmbeddings.length} embeddings for ${doc.title}`);
    } catch (error) {
      console.error(`Failed to generate embeddings for ${doc.title}:`, error);
    }
  }

  // Write to file
  // Calculate path relative to packages/scripts
  const outputPath = join(
    __dirname,
    "../../zero/src/demo-content-embeddings.ts"
  );
  
  const fileContent = `/**
 * Pre-computed embeddings for demo content.
 * 
 * This file is auto-generated by running: npm run generate-demo-embeddings
 * 
 * The embeddings are pre-computed to avoid regenerating them every time
 * a workspace is created with demo content, since the content is always the same.
 */

export interface DemoContentEmbeddings {
  [title: string]: {
    contentEmbeddings: Array<{
      content: string;
      embedding: number[];
      chunkIndex: number | null;
      heading: string | null;
      headingLevel: number | null;
      headerBreadcrumb: string | null;
    }>;
    titleEmbedding: number[];
  };
}

export const demoContentEmbeddings: DemoContentEmbeddings = ${JSON.stringify(embeddings, null, 2)};
`;

  writeFileSync(outputPath, fileContent, "utf-8");
  console.log(`\n✓ Embeddings written to ${outputPath}`);
  console.log(`✓ Generated embeddings for ${Object.keys(embeddings).length} documents`);
}

generateEmbeddingsForDemoContent().catch((error) => {
  console.error("Error generating demo content embeddings:", error);
  process.exit(1);
});
