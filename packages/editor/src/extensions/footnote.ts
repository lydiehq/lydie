import { mergeAttributes, Node, wrappingInputRule } from "@tiptap/core";

import { inlineAtomInputRule } from "./input-rules";

// `[^label]` in text and `[^label]: …` definitions. Both carry the label as written, so numbering
// and ordering stay whatever the Markdown source says.
export type FootnoteAttrs = { label: string };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnoteReference: (label: string) => ReturnType;
    };
  }
}

const labelAttribute = {
  label: {
    default: "",
    parseHTML: (el: HTMLElement) => el.getAttribute("data-label") ?? "",
    renderHTML: (attrs: Record<string, unknown>) => ({ "data-label": attrs.label as string }),
  },
};

export const FootnoteReference = Node.create({
  name: "footnoteReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return labelAttribute;
  },

  parseHTML() {
    return [{ tag: 'sup[data-type="footnote-reference"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { "data-type": "footnote-reference" })];
  },

  renderText({ node }) {
    return `[^${(node.attrs as FootnoteAttrs).label}]`;
  },

  addCommands() {
    return {
      insertFootnoteReference:
        (label) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { label } }),
    };
  },

  addInputRules() {
    return [
      inlineAtomInputRule({
        // Not at the start of a block, where `[^1]: ` begins a definition.
        find: /(?<=.)\[\^([^\]\s]+)\]$/,
        type: this.type,
        getAttributes: (match) => ({ label: match[1] ?? "" }),
      }),
    ];
  },
});

export const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return labelAttribute;
  },

  parseHTML() {
    return [{ tag: 'div[data-type="footnote-definition"]', contentElement: ":scope > div" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "footnote-definition" }),
      ["div", 0],
    ];
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\[\^([^\]\s]+)\]:\s$/,
        type: this.type,
        getAttributes: (match) => ({ label: match[1] ?? "" }),
      }),
    ];
  },
});
