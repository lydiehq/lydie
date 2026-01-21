import { renderWithBuilder, type ContentNode } from "../content"
import { MarkdownSerializer, MarkdownSerializer as MarkdownBuilder } from "./markdown-serializer"
import { deserializeFromMarkdown, type MarkdownDeserializeOptions } from "./markdown-deserializer"

export { MarkdownSerializer, MarkdownBuilder }

export { deserializeFromMarkdown, deserializeFromMarkdown as parseMarkdownToTipTap }
export type { MarkdownDeserializeOptions, MarkdownDeserializeOptions as MarkdownParseOptions }

export function serializeToMarkdown(content: ContentNode): string {
  const serializer = new MarkdownSerializer()
  return renderWithBuilder(content, serializer)
}

export { parseFrontmatter } from "./frontmatter"
export type { FrontmatterResult } from "./frontmatter"
