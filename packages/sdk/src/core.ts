// Re-export core functionality from @lydie/core
export type {
  CustomBlockProps,
  RelatedDocument,
  TocItem,
  Document,
  DocumentListItem,
  Folder,
  ContentNode,
  TextNode,
  Mark,
  NodeBuilder,
  LinkReference,
  LinkResolver,
} from "@lydie/core/content";

export {
  LydieClient,
  extractTableOfContents,
  extractText,
  renderWithBuilder,
} from "@lydie/core/content";
export { serializeToHTML } from "@lydie/core/serialization/html";
export { serializeToMarkdown, MarkdownBuilder } from "@lydie/core/serialization/markdown";
export { serializeToPlainText } from "@lydie/core/serialization/text";
