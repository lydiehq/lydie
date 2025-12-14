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
  ContentBuilder,
} from "./core";

export {
  LydieClient,
  extractTableOfContents,
  renderContentWithBuilder,
} from "./core";
