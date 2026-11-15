// The Lydie document schema. Node and mark names and attributes are a contract with
// `@lydie/editor` (TipTap extensions must match them exactly); see SPEC.md "Schema contract".
// No toDOM/parseDOM: this package is headless, the editor supplies rendering.
import { Schema } from "prosemirror-model";

const atom = { atom: true, selectable: true } as const;

export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
      defining: true,
    },
    bulletList: { group: "block", content: "listItem+" },
    orderedList: { group: "block", content: "listItem+", attrs: { start: { default: 1 } } },
    listItem: { content: "paragraph block*", defining: true },
    taskList: { group: "block", content: "taskItem+" },
    taskItem: {
      content: "paragraph block*",
      attrs: { checked: { default: false } },
      defining: true,
    },
    blockquote: { group: "block", content: "block+", defining: true },
    codeBlock: {
      group: "block",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      attrs: { language: { default: null } },
    },
    horizontalRule: { group: "block" },
    hardBreak: { group: "inline", inline: true, selectable: false },
    image: {
      group: "inline",
      inline: true,
      ...atom,
      attrs: { src: { default: "" }, alt: { default: null }, title: { default: null } },
    },
    table: { group: "block", content: "tableRow+", isolating: true },
    tableRow: { content: "(tableCell | tableHeader)*" },
    tableHeader: {
      content: "paragraph",
      isolating: true,
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
        align: { default: null },
      },
    },
    tableCell: {
      content: "paragraph",
      isolating: true,
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
        align: { default: null },
      },
    },
    callout: {
      group: "block",
      content: "block+",
      defining: true,
      // fold: null, "+" or "-". title: null when the header has no title text.
      attrs: { kind: { default: "note" }, title: { default: null }, fold: { default: null } },
    },
    wikiLink: {
      group: "inline",
      inline: true,
      ...atom,
      attrs: {
        target: { default: "" },
        heading: { default: null },
        blockId: { default: null },
        alias: { default: null },
      },
    },
    embed: {
      group: "block",
      ...atom,
      attrs: {
        target: { default: "" },
        heading: { default: null },
        blockId: { default: null },
        alias: { default: null },
      },
    },
    // LaTeX source is the text content, so it stays editable like code.
    mathInline: { group: "inline", inline: true, content: "text*", marks: "", code: true },
    mathBlock: { group: "block", content: "text*", marks: "", code: true, defining: true },
    footnoteReference: {
      group: "inline",
      inline: true,
      ...atom,
      attrs: { label: { default: "" } },
    },
    footnoteDefinition: { group: "block", content: "block+", attrs: { label: { default: "" } } },
    directive: {
      group: "block",
      content: "block+",
      defining: true,
      attrs: { name: { default: "" }, attrs: { default: {} } },
    },
    // `::::columns` holding only `:::column` directives (any other shape stays a `directive`).
    // `width` is the column's share of the row in percent, null for an equal share.
    columnList: { group: "block", content: "column+", isolating: true },
    column: { content: "block+", isolating: true, attrs: { width: { default: null } } },
    // Verbatim source of anything without a node of its own (HTML, definitions, comments, ...).
    rawBlock: { group: "block", ...atom, attrs: { source: { default: "" } } },
    rawInline: { group: "inline", inline: true, ...atom, attrs: { source: { default: "" } } },
  },
  marks: {
    link: { attrs: { href: { default: "" }, title: { default: null } }, inclusive: false },
    bold: {},
    italic: {},
    strike: {},
    highlight: {},
    // Markdown allows code inside links and emphasis, so code does not exclude other marks.
    code: {},
  },
});

export type NodeName = keyof typeof schema.nodes;
export type MarkName = keyof typeof schema.marks;
