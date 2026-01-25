import { type ContentNode, renderWithBuilder } from "../content";
import { type MarkdownDeserializeOptions, deserializeFromMarkdown } from "./markdown-deserializer";
import { MarkdownSerializer as MarkdownBuilder, MarkdownSerializer } from "./markdown-serializer";

export { MarkdownSerializer, MarkdownBuilder };

export { deserializeFromMarkdown, deserializeFromMarkdown as parseMarkdownToTipTap };
export type { MarkdownDeserializeOptions, MarkdownDeserializeOptions as MarkdownParseOptions };

export function serializeToMarkdown(content: ContentNode): string {
  const serializer = new MarkdownSerializer();
  return renderWithBuilder(content, serializer);
}

export { parseFrontmatter } from "./frontmatter";
export type { FrontmatterResult } from "./frontmatter";
