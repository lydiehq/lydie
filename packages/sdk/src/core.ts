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
  ContentBuilder,
} from "@lydie/core/content";

export {
  LydieClient,
  extractTableOfContents,
  extractText,
  renderContentWithBuilder,
  renderContentToHTML,
  HTMLBuilder,
} from "@lydie/core/content";
