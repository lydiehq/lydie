// Core exports (no React dependencies)
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
} from "./core";

export {
  LydieClient,
  extractTableOfContents,
  renderWithBuilder,
} from "./core";
