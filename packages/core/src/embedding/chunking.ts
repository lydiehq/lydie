import { serializeToHTML } from "../serialization/html";
import { serializeToPlainText } from "../serialization/text";

export interface Chunk {
  content: string;
  heading?: string;
  level?: number;
  index: number;
  sectionKey?: string;
}

export interface ParagraphChunk {
  content: string;
  headerBreadcrumb: string;
  headerPath: string[];
  headerLevels: number[];
  index: number;
  sectionKey?: string;
}

export function generateParagraphChunks(
  jsonContent: any,
  minChunkSize: number = 50,
  sectionKey?: string
): ParagraphChunk[] {
  const chunks: ParagraphChunk[] = [];

  if (!jsonContent?.content || !Array.isArray(jsonContent.content)) {
    return chunks;
  }

  const headingStack: { text: string; level: number }[] = [];
  let pendingContent: string[] = [];
  let chunkIndex = 0;

  function getHeaderBreadcrumb(): {
    breadcrumb: string;
    path: string[];
    levels: number[];
  } {
    if (headingStack.length === 0) {
      return { breadcrumb: "", path: [], levels: [] };
    }

    const path = headingStack.map((h) => h.text);
    const levels = headingStack.map((h) => h.level);
    const breadcrumb = headingStack
      .map((h) => `${"#".repeat(h.level)} ${h.text}`)
      .join(" > ");

    return { breadcrumb, path, levels };
  }

  function flushPendingContent() {
    if (pendingContent.length === 0) return;

    const content = pendingContent.join("\n");
    const plainTextLength = stripHtmlTags(content).length;

    if (plainTextLength >= minChunkSize) {
      const { breadcrumb, path, levels } = getHeaderBreadcrumb();

      const contentWithContext = breadcrumb
        ? `${breadcrumb}\n\n${content}`
        : content;

      chunks.push({
        content: contentWithContext,
        headerBreadcrumb: breadcrumb,
        headerPath: path,
        headerLevels: levels,
        index: chunkIndex++,
        sectionKey,
      });
    }

    pendingContent = [];
  }

  function updateHeadingStack(text: string, level: number) {
    while (
      headingStack.length > 0 &&
      headingStack[headingStack.length - 1]!.level >= level
    ) {
      headingStack.pop();
    }

    headingStack.push({ text, level });
  }

  for (const node of jsonContent.content) {
    if (!node || typeof node !== "object" || !node.type) continue;

    if (node.type === "heading") {
      flushPendingContent();

      const headingText = serializeToPlainText(node).trim();
      const level = node.attrs?.level || 1;

      if (headingText) {
        updateHeadingStack(headingText, level);
      }
    } else if (
      node.type === "paragraph" ||
      node.type === "bulletList" ||
      node.type === "orderedList" ||
      node.type === "blockquote" ||
      node.type === "codeBlock"
    ) {
      try {
        const html = serializeToHTML(node);
        const plainText = serializeToPlainText(node).trim();

        if (plainText.length > 0) {
          if (plainText.length >= minChunkSize * 2) {
            flushPendingContent();
            pendingContent.push(html);
            flushPendingContent();
          } else {
            pendingContent.push(html);

            const accumulatedLength = stripHtmlTags(
              pendingContent.join("\n")
            ).length;
            if (accumulatedLength >= minChunkSize * 3) {
              flushPendingContent();
            }
          }
        }
      } catch (error) {
        console.warn(`[ParagraphChunking] Error processing ${node.type}:`, error);
      }
    }
  }

  flushPendingContent();

  return chunks;
}

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
    if (!node || typeof node !== "object" || !node.type) return;

    if (node.type === "heading") {
      try {
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
      } catch (error) {
        console.warn(`[Chunking] Error processing heading node:`, error);
      }
    } else if (
      node.type === "paragraph" ||
      node.type === "bulletList" ||
      node.type === "orderedList" ||
      node.type === "blockquote" ||
      node.type === "codeBlock"
    ) {
      try {
        const contentHtml = serializeToHTML(node);
        const plainText = serializeToPlainText(node);

        if (plainText.trim()) {
          items.push({
            type: "content",
            htmlContent: contentHtml,
            plainText: plainText.trim(),
          });
        }
      } catch (error) {
        console.warn(`[Chunking] Error processing ${node.type} node:`, error);
      }
    }

    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(jsonContent);
  return items;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateHeadingAwareChunks(
  jsonContent: any,
  maxChunkSize: number = 1000,
  minChunkSize: number = 100,
  overlapSize: number = 200,
  sectionKey?: string
): Chunk[] {
  const items = extractContentWithHeadings(jsonContent);
  const chunks: Chunk[] = [];

  let currentHeading: string | undefined;
  let currentLevel: number | undefined;
  let currentChunkHtml: string[] = [];
  let previousChunkOverlapHtml: string[] = [];
  let chunkIndex = 0;

  function flushChunk() {
    if (currentChunkHtml.length === 0) return;

    const htmlContent = currentChunkHtml.join("\n");
    const plainTextLength = stripHtmlTags(htmlContent).length;

    if (plainTextLength >= minChunkSize) {
      chunks.push({
        content: htmlContent,
        heading: currentHeading,
        level: currentLevel,
        index: chunkIndex++,
        sectionKey: sectionKey,
      });

      previousChunkOverlapHtml = [];
      let overlapLength = 0;

      for (let i = currentChunkHtml.length - 1; i >= 0; i--) {
        const itemLength = stripHtmlTags(currentChunkHtml[i]!).length;
        if (overlapLength + itemLength <= overlapSize) {
          previousChunkOverlapHtml.unshift(currentChunkHtml[i]!);
          overlapLength += itemLength;
        } else {
          break;
        }
      }
    }

    currentChunkHtml = [];
  }

  for (const item of items) {
    if (item.type === "heading") {
      flushChunk();

      previousChunkOverlapHtml = [];

      currentHeading = item.plainText;
      currentLevel = item.level;

      currentChunkHtml.push(item.htmlContent);
    } else {
      const overlapLength =
        previousChunkOverlapHtml.length > 0
          ? stripHtmlTags(previousChunkOverlapHtml.join("\n")).length
          : 0;
      const currentPlainLength = stripHtmlTags(
        currentChunkHtml.join("\n")
      ).length;
      const itemPlainLength = item.plainText.length;
      const combinedLength =
        overlapLength + currentPlainLength + itemPlainLength;

      if (combinedLength > maxChunkSize && currentChunkHtml.length > 0) {
        flushChunk();

        currentChunkHtml = [...previousChunkOverlapHtml, item.htmlContent];
      } else {
        currentChunkHtml.push(item.htmlContent);
      }
    }
  }

  flushChunk();

  return chunks;
}

export function generateSimpleChunks(
  text: string,
  maxChunkSize: number = 300
): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  const chunks: string[] = [];

  paragraphs.forEach((paragraph) => {
    if (paragraph.length <= maxChunkSize) {
      chunks.push(paragraph.trim());
    } else {
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
