import { mergeAttributes, Node, wrappingInputRule } from "@tiptap/core";

// A `:::name{key=val}` container directive: Lydie-only blocks that degrade to readable text in
// other Markdown tools. `attrs` holds the `{…}` attributes as strings.
export type DirectiveAttrs = {
  name: string;
  attrs: Record<string, string>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    directive: {
      setDirective: (attrs: Partial<DirectiveAttrs> & { name: string }) => ReturnType;
    };
  }
}

function parseAttrs(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
      );
    }
  } catch {
    // Not JSON: treat as no attributes.
  }
  return {};
}

export function directiveLabel(attrs: DirectiveAttrs) {
  const pairs = Object.entries(attrs.attrs).map(([key, value]) => `${key}=${value}`);
  return `:::${attrs.name}${pairs.length ? `{${pairs.join(" ")}}` : ""}`;
}

export const Directive = Node.create({
  name: "directive",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? "",
        renderHTML: (attrs) => ({ "data-name": attrs.name as string }),
      },
      attrs: {
        default: {},
        parseHTML: (el) => parseAttrs(el.getAttribute("data-attrs")),
        renderHTML: (attrs) => ({ "data-attrs": JSON.stringify(attrs.attrs ?? {}) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="directive"]', contentElement: "[data-directive-content]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "directive" }),
      [
        "div",
        { "data-directive-label": "", contenteditable: "false" },
        directiveLabel(node.attrs as DirectiveAttrs),
      ],
      ["div", { "data-directive-content": "" }, 0],
    ];
  },

  addCommands() {
    return {
      setDirective:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { attrs: {}, ...attrs }),
    };
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^:::([\w-]+)\s$/,
        type: this.type,
        getAttributes: (match) => ({ name: match[1] ?? "", attrs: {} }),
      }),
    ];
  },
});
