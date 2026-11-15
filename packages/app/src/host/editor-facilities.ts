import { assignBlockId, extract, parse, save } from "@lydie/markdown";
import type { ParseResult } from "@lydie/markdown";
import type {
  AnyExtension,
  EditorFacilities,
  JSONContent,
  ParsedDocument,
  SlashCommandItem,
} from "@lydie/plugin-api";

import type { ContributionRegistry } from "./contributions.ts";

// Markdown ⇄ editor document for plugins, through @lydie/markdown (which plugins cannot import).
export function createEditorFacilities(contributions: ContributionRegistry): EditorFacilities {
  return {
    fromMarkdown(markdown) {
      const result = parse(markdown);
      return { content: result.doc.toJSON() as JSONContent, source: result };
    },
    toMarkdown(original, content) {
      const base: ParseResult | string =
        typeof original === "string"
          ? original
          : ((original as ParsedDocument).source as ParseResult);
      return save({ original: base, doc: content as { type: string } }).source;
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
