import type { ContentNode } from "@lydie/core/content";

import { generateParagraphChunks, generateSimpleChunks } from "@lydie/core/embedding/chunking";
import { generateManyEmbeddings, generateTitleEmbedding } from "@lydie/core/embedding/generation";
import { extractSections } from "@lydie/core/embedding/section-hashing";
import { serializeToPlainText } from "@lydie/core/serialization/text";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

import { createOnboardingContent, demoContent, ONBOARDING_GUIDE_ID } from "./onboarding-content";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Normalize content by converting onboarding-specific nodes and taskList/taskItem
function normalizeContentForYjs(content: any): ContentNode {
  if (!content || typeof content !== "object") {
    return content;
  }

  // Recursively process the content tree
  if (Array.isArray(content)) {
    return content.map(normalizeContentForYjs) as any;
  }

  // Convert onboarding-specific nodes to regular nodes
  if (content.type === "onboardingTextPractice") {
    return {
      type: "paragraph",
      content: content.content ? (content.content as any[]).map(normalizeContentForYjs) : undefined,
    };
  }

  if (content.type === "onboardingAssistantTask") {
    return {
      type: "paragraph",
      content: content.attrs?.prompt ? [{ type: "text", text: content.attrs.prompt }] : undefined,
    };
  }

  if (content.type === "taskList") {
    return {
      ...content,
      type: "bulletList",
      content: content.content ? (content.content as any[]).map(normalizeContentForYjs) : undefined,
    };
  }

  if (content.type === "taskItem") {
    return {
      ...content,
      type: "listItem",
      content: content.content ? (content.content as any[]).map(normalizeContentForYjs) : undefined,
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

async function generateEmbeddingsForDocument(
  title: string,
  content: any,
): Promise<EmbeddingData | null> {
  try {
    // Convert onboarding-specific nodes to regular nodes
    const normalizedContent = normalizeContentForYjs(content);

    // Convert JSON to Yjs and back to ensure consistent processing
    const yjsState = convertJsonToYjs(normalizedContent);
    if (!yjsState) {
      console.warn(`Failed to convert ${title} to Yjs, skipping`);
      return null;
    }

    const jsonContent = convertYjsToJson(yjsState);
    if (!jsonContent) {
      console.warn(`Failed to convert ${title} from Yjs, skipping`);
      return null;
    }

    // Generate title embedding
    const titleEmbedding = await generateTitleEmbedding(title);

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
          `Failed to generate paragraph chunks for ${title}, falling back to simple chunking`,
          error,
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
          ? (chunk.headerPath[chunk.headerPath.length - 1] ?? null)
          : ((chunk as any).heading ?? null),
      headingLevel:
        "headerLevels" in chunk
          ? (chunk.headerLevels[chunk.headerLevels.length - 1] ?? null)
          : ((chunk as any).level ?? null),
      headerBreadcrumb: "headerBreadcrumb" in chunk ? chunk.headerBreadcrumb : null,
    }));

    return {
      contentEmbeddings,
      titleEmbedding,
    };
  } catch (error) {
    console.error(`❌ Failed to generate embeddings for ${title}:`, error);
    return null;
  }
}

async function generateEmbeddingsForOnboardingContent() {
  console.log("🚀 Generating embeddings for onboarding content...\n");
  const embeddings: Record<string, EmbeddingData> = {};

  // Generate embeddings for onboarding guide
  console.log("Processing: Welcome to Your Workspace (onboarding guide)");
  const guideContent = createOnboardingContent();
  const guideTitle = "👋 Welcome to Your Workspace!";
  const guideEmbeddings = await generateEmbeddingsForDocument(guideTitle, guideContent);

  if (guideEmbeddings) {
    embeddings[ONBOARDING_GUIDE_ID] = guideEmbeddings;
    console.log(
      `✅ Generated ${guideEmbeddings.contentEmbeddings.length} embeddings for onboarding guide`,
    );
  }

  // Generate embeddings for demo content documents
  for (const doc of demoContent) {
    console.log(`Processing: ${doc.title}`);
    const docEmbeddings = await generateEmbeddingsForDocument(doc.title, doc.content);

    if (docEmbeddings) {
      embeddings[doc.id] = docEmbeddings;
      console.log(
        `✅ Generated ${docEmbeddings.contentEmbeddings.length} embeddings for ${doc.title} (${doc.id})`,
      );
    }
  }

  // Write to file - path relative to zero package src directory
  const outputPath = join(__dirname, "./embeddings.ts");

  const fileContent = `// Pre-computed embeddings for onboarding content.
// 
// This file is auto-generated by running: npm run generate:onboarding-embeddings -w @lydie/zero
// 
// The embeddings are pre-computed to avoid regenerating them every time
// a user creates a new organization, since the onboarding content is always the same.
//
// Keys are stable identifiers (not titles) to allow titles to change without breaking lookups.
// See guide-content.ts for the ID constants.

export interface OnboardingEmbeddings {
  [id: string]: {
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

export const onboardingEmbeddings: OnboardingEmbeddings = ${JSON.stringify(embeddings, null, 2)};
`;

  writeFileSync(outputPath, fileContent, "utf-8");
  console.log(`\n✅ Embeddings written to ${outputPath}`);
  console.log(`✅ Generated embeddings for ${Object.keys(embeddings).length} documents`);
}

generateEmbeddingsForOnboardingContent().catch((error) => {
  console.error("Error generating onboarding content embeddings:", error);
  process.exit(1);
});
