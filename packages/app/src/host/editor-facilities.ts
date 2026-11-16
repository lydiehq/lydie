import { parseHtml } from "@lydie/editor";
import { assignBlockId, extract, parse, save, serialize } from "@lydie/markdown";
import type { ParseResult } from "@lydie/markdown";
import type {
  AnyExtension,
  EditorFacilities,
  JSONContent,
  ParsedDocument,
  SlashCommandItem,
} from "@lydie/plugin-api";

import type { ContributionRegistry } from "./contributions.ts";

// The editor's images are blocks; Markdown's are inline (LYD-156). An image among blocks goes in a
// paragraph of its own, which is what `![](src)` on its own line reads back as.
function inlineImages(node: JSONContent): JSONContent {
  if (!node.content) return node;
  const content = node.content.map((child) =>
    child.type === "image" && node.type !== "paragraph"
      ? { type: "paragraph", content: [child] }
      : inlineImages(child),
  );
  return { ...node, content };
}

// Markdown folds a callout with "+"/"-", the editor with "open"/"closed" (LYD-156; the hosted
// codec maps them the same way). @lydie/markdown's importDoc maps them back on save.
const EDITOR_FOLDS: Record<string, string> = { "+": "open", "-": "closed" };
function editorFolds(node: JSONContent): JSONContent {
  const fold = node.type === "callout" ? node.attrs?.fold : undefined;
  const attrs =
    typeof fold === "string" && EDITOR_FOLDS[fold]
      ? { ...node.attrs, fold: EDITOR_FOLDS[fold] }
      : node.attrs;
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(node.content ? { content: node.content.map(editorFolds) } : {}),
  };
}

// Markdown ⇄ editor document for plugins, through @lydie/markdown (which plugins cannot import).
export function createEditorFacilities(contributions: ContributionRegistry): EditorFacilities {
  return {
    fromMarkdown(markdown) {
      const result = parse(markdown);
      let content: JSONContent | null = null;
      // Converted when first read: the doc view takes the text it has just saved (a cached parse)
      // only as the original of its next save.
      return {
        get content() {
          return (content ??= editorFolds(result.doc.toJSON() as JSONContent));
        },
        source: result,
      };
    },
    toMarkdown(original, content) {
      const base: ParseResult | string =
        typeof original === "string"
          ? original
          : ((original as ParsedDocument).source as ParseResult);
      return save({ original: base, doc: content as { type: string } }).source;
    },
    fromHtml(html) {
      const dom = new DOMParser().parseFromString(html, "text/html");
      return serialize(inlineImages(parseHtml(dom.body)) as { type: string });
    },
    splitFrontmatter(markdown) {
      const result = parse(markdown);
      const start = result.frontmatter?.to ?? 0;
      return {
        properties: result.properties,
        body: start ? markdown.slice(start) : markdown.replace(/^﻿/, ""),
      };
    },
    outline(markdown) {
      const info = extract(markdown);
      return {
        headings: info.headings.map((h) => ({ level: h.level, text: h.text, block: h.block })),
        blocks: info.blocks.map((b) => ({ index: b.index, type: b.type, id: b.id, text: b.text })),
      };
    },
    assignBlockId(markdown, index) {
      const result = assignBlockId(markdown, index);
      return { markdown: result.source, id: result.id };
    },
    extensions() {
      const out: AnyExtension[] = [];
      for (const item of contributions.list("editor")) {
        if (item.extensions) out.push(...item.extensions());
      }
      return out;
    },
    slashItems() {
      const out: SlashCommandItem[] = [];
      for (const item of contributions.list("editor")) {
        const items = typeof item.slashItems === "function" ? item.slashItems() : item.slashItems;
        if (items) out.push(...items);
      }
      return out;
    },
  };
}
