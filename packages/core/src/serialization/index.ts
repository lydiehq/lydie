/**
 * Content serializers and deserializers for TipTap JSON
 * 
 * This module provides a set of serializers and deserializers for converting
 * between TipTap JSON and various text formats (Markdown, MDX, HTML, plain text).
 * 
 * ## Terminology
 * 
 * - **Serializer**: Converts TipTap JSON → external format (MD/MDX/HTML/Text)
 * - **Deserializer**: Converts external format → TipTap JSON
 * 
 * ## Available Serializers (TipTap JSON → Text)
 * - `serializeToMarkdown` - Convert to Markdown
 * - `serializeToHTML` - Convert to HTML
 * - `serializeToPlainText` - Convert to plain text
 * 
 * ## Available Deserializers (Text → TipTap JSON)
 * - `deserializeFromMarkdown` - Convert from Markdown
 * - `deserializeFromMDX` - Convert from MDX (Markdown with JSX)
 * - `deserializeFromText` - Convert from plain text
 * - `deserializeFromFile` - Unified deserializer that routes based on file extension
 * 
 * @example
 * ```typescript
 * import { serializeToMarkdown, deserializeFromFile } from '@lydie/core/serialization';
 * 
 * // Serialize TipTap JSON to Markdown
 * const tipTapContent = {
 *   type: "doc",
 *   content: [
 *     { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hello" }] }
 *   ]
 * };
 * const markdown = serializeToMarkdown(tipTapContent);
 * // Output: "# Hello"
 * 
 * // Deserialize a file based on extension
 * const content = deserializeFromFile(fileContent, "document.md");
 * ```
 */

import { renderContentWithBuilder, type ContentNode } from "../content";
import { HTMLSerializer } from "./html-serializer";
import { MarkdownSerializer } from "./markdown-serializer";
import { PlainTextSerializer } from "./plaintext-serializer";
import { deserializeFromMarkdown } from "./markdown-deserializer";
import { deserializeFromMDX, extractMDXComponents, type MDXDeserializeOptions, type MDXComponent } from "./mdx-deserializer";
import { deserializeFromText, type TextDeserializeOptions } from "./text-deserializer";

// ============================================================================
// Export Serializers (TipTap JSON → Text)
// ============================================================================

export { HTMLSerializer } from "./html-serializer";
export { MarkdownSerializer } from "./markdown-serializer";
export { PlainTextSerializer } from "./plaintext-serializer";

// Export backwards-compatible names
export { HTMLSerializer as HTMLBuilder } from "./html-serializer";
export { MarkdownSerializer as MarkdownBuilder } from "./markdown-serializer";
export { PlainTextSerializer as PlainTextBuilder } from "./plaintext-serializer";

// ============================================================================
// Export Deserializers (Text → TipTap JSON)
// ============================================================================

export { deserializeFromMarkdown } from "./markdown-deserializer";
export type { MarkdownDeserializeOptions } from "./markdown-deserializer";

export { deserializeFromMDX, extractMDXComponents } from "./mdx-deserializer";
export type { MDXDeserializeOptions, MDXComponent } from "./mdx-deserializer";

export { deserializeFromText } from "./text-deserializer";
export type { TextDeserializeOptions } from "./text-deserializer";

// Export backwards-compatible names
export { deserializeFromMarkdown as parseMarkdownToTipTap } from "./markdown-deserializer";
export type { MarkdownDeserializeOptions as MarkdownParseOptions } from "./markdown-deserializer";

export { deserializeFromMDX as parseMDXToTipTap } from "./mdx-deserializer";
export type { MDXDeserializeOptions as MDXParseOptions } from "./mdx-deserializer";

export { deserializeFromText as parseTextToTipTap } from "./text-deserializer";
export type { TextDeserializeOptions as TextParseOptions } from "./text-deserializer";

// ============================================================================
// Serialization Functions (TipTap JSON → Text)
// ============================================================================

/**
 * Serialize TipTap content to HTML string
 * 
 * @param content - TipTap JSON content
 * @param options - Serialization options
 * @returns HTML string
 */
export function serializeToHTML(
  content: ContentNode,
  options?: { linkPrefix?: string }
): string {
  const serializer = new HTMLSerializer(options);
  return renderContentWithBuilder(content, serializer);
}

/**
 * Serialize TipTap content to Markdown string
 * 
 * @param content - TipTap JSON content
 * @returns Markdown string
 */
export function serializeToMarkdown(content: ContentNode): string {
  const serializer = new MarkdownSerializer();
  return renderContentWithBuilder(content, serializer);
}

/**
 * Serialize TipTap content to plain text string
 * 
 * @param content - TipTap JSON content
 * @returns Plain text string
 */
export function serializeToPlainText(content: ContentNode): string {
  const serializer = new PlainTextSerializer();
  return renderContentWithBuilder(content, serializer);
}

// Backwards-compatible function names
export { serializeToHTML as renderContentToHTML };
export { serializeToMarkdown as renderContentToMarkdown };
export { serializeToPlainText as renderContentToPlainText };

// ============================================================================
// Deserialization Functions (Text → TipTap JSON)
// ============================================================================

/**
 * Unified deserializer that routes to the correct deserializer based on file extension
 * Supports: .md, .mdx, .txt
 * 
 * @param content - The file content as a string
 * @param filename - The filename (used to determine file type from extension)
 * @param options - Deserializer options (varies by file type)
 * @returns TipTap JSON content
 * 
 * @example
 * ```typescript
 * const tipTapContent = deserializeFromFile(markdownContent, "document.md");
 * const mdxContent = deserializeFromFile(mdxContent, "document.mdx", { componentSchemas: {...} });
 * const textContent = deserializeFromFile(textContent, "document.txt");
 * ```
 */
export { deserializeFromHTML } from "./html-deserializer";
export type { HTMLDeserializeOptions } from "./html-deserializer";

