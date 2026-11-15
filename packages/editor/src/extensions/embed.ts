import { mergeAttributes, Node } from "@tiptap/core";

import { blockAtomInputRule } from "./input-rules";
import { parseWikiLink, stringAttr } from "./wiki-link";
import type { WikiLinkAttrs } from "./wiki-link";

// `![[target#heading|alias]]` or `![[target#^blockId|alias]]`: a whole note, heading or block shown
// inside this one; for images, alias holds the size (`|300`). The same attributes as
// @lydie/markdown's embed. Embeds written before they were split hold the whole text in `target`,
// which `embedSource` gives back unchanged.
export type EmbedAttrs = WikiLinkAttrs;

// The text between `![[` and `]]`.
export function embedSource(attrs: EmbedAttrs): string {
  const part = attrs.heading ? `#${attrs.heading}` : attrs.blockId ? `#^${attrs.blockId}` : "";
  return `${attrs.target}${part}${attrs.alias ? `|${attrs.alias}` : ""}`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      // `target` alone may be the whole text between the brackets; it is split like a typed embed.
      insertEmbed: (attrs: Pick<EmbedAttrs, "target"> & Partial<EmbedAttrs>) => ReturnType;
    };
  }
}

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-target") ?? "",
        renderHTML: (attrs) => ({ "data-target": attrs.target as string }),
      },
      heading: stringAttr("heading"),
      blockId: stringAttr("block-id"),
      alias: stringAttr("alias"),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "embed" }),
      ["span", {}, `![[${embedSource(node.attrs as EmbedAttrs)}]]`],
    ];
  },

  renderText({ node }) {
    return `![[${embedSource(node.attrs as EmbedAttrs)}]]`;
  },

  addCommands() {
    return {
      insertEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs:
              attrs.heading === undefined &&
              attrs.blockId === undefined &&
              attrs.alias === undefined
                ? parseWikiLink(attrs.target)
                : attrs,
          }),
    };
  },

  addInputRules() {
    return [
      blockAtomInputRule({
        find: /^!\[\[([^[\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => parseWikiLink((match[1] ?? "").trim()),
      }),
    ];
  },
});
