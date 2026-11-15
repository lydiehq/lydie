import { mergeAttributes, Node } from "@tiptap/core";

// Verbatim Markdown the editor has no node for (HTML blocks, unknown syntax). `source` is written
// back unchanged, which is what keeps unknown constructs byte-stable on save. The React editor
// shows it as an editable source field.
export type RawAttrs = { source: string };

const sourceAttribute = {
  source: {
    default: "",
    parseHTML: (el: HTMLElement) => el.getAttribute("data-source") ?? el.textContent ?? "",
    renderHTML: () => ({}),
  },
};

export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return sourceAttribute;
  },

  parseHTML() {
    return [{ tag: 'div[data-type="raw-block"]', preserveWhitespace: "full" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "raw-block" }),
      (node.attrs as RawAttrs).source,
    ];
  },

  renderText({ node }) {
    return (node.attrs as RawAttrs).source;
  },
});

export const RawInline = Node.create({
  name: "rawInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return sourceAttribute;
  },

  parseHTML() {
    return [{ tag: 'span[data-type="raw-inline"]', preserveWhitespace: "full" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "raw-inline" }),
      (node.attrs as RawAttrs).source,
    ];
  },

  renderText({ node }) {
    return (node.attrs as RawAttrs).source;
  },
});
