import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { findWrapping } from "@tiptap/pm/transform";

// Obsidian callout: `> [!kind]± title`. `fold` is null for a plain callout, "open" for `+` and
// "closed" for `-`.
export type CalloutFold = "open" | "closed" | null;

export type CalloutAttrs = {
  kind: string;
  title: string | null;
  fold: CalloutFold;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: Partial<CalloutAttrs>) => ReturnType;
      toggleCallout: (attrs?: Partial<CalloutAttrs>) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export function parseFold(value: string | null | undefined): CalloutFold {
  if (value === "open" || value === "+") return "open";
  if (value === "closed" || value === "-") return "closed";
  return null;
}

export function calloutLabel(attrs: Pick<CalloutAttrs, "kind" | "title">) {
  if (attrs.title) return attrs.title;
  return attrs.kind.charAt(0).toUpperCase() + attrs.kind.slice(1);
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "note",
        parseHTML: (el) => el.getAttribute("data-kind") ?? "note",
        renderHTML: (attrs) => ({ "data-kind": attrs.kind as string }),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-title"),
        renderHTML: (attrs) => (attrs.title ? { "data-title": attrs.title as string } : {}),
      },
      fold: {
        default: null,
        parseHTML: (el) => parseFold(el.getAttribute("data-fold")),
        renderHTML: (attrs) => (attrs.fold ? { "data-fold": attrs.fold as string } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]', contentElement: "[data-callout-content]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as CalloutAttrs;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        "data-folded": String(attrs.fold === "closed"),
      }),
      ["div", { "data-callout-title": "", contenteditable: "false" }, calloutLabel(attrs)],
      ["div", { "data-callout-content": "" }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs),
      toggleCallout:
        (attrs) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attrs),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addInputRules() {
    const type = this.type;
    return [
      // `[!note] ` at the start of a block. Inside a blockquote (the Markdown way of typing it,
      // `> [!note] `) the blockquote itself becomes the callout.
      new InputRule({
        find: /^\[!([\w-]+)\]([+-])?\s$/,
        handler: ({ state, range, match }) => {
          const attrs: CalloutAttrs = {
            kind: (match[1] ?? "note").toLowerCase(),
            title: null,
            fold: parseFold(match[2]),
          };
          const { tr } = state;
          const $from = state.doc.resolve(range.from);
          tr.delete(range.from, range.to);

          for (let depth = $from.depth - 1; depth > 0; depth--) {
            if ($from.node(depth).type.name === "blockquote") {
              tr.setNodeMarkup($from.before(depth), type, attrs);
              return;
            }
          }

          const blockRange = tr.doc.resolve(range.from).blockRange();
          const wrapping = blockRange && findWrapping(blockRange, type, attrs);
          if (!blockRange || !wrapping) return null;
          tr.wrap(blockRange, wrapping);
        },
      }),
    ];
  },
});
