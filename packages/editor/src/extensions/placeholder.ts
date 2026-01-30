import type { NodeViewRenderer } from "@tiptap/core";

import { Node } from "@tiptap/core";

export interface PlaceholderOptions {
  addNodeView?: () => NodeViewRenderer;
  HTMLAttributes?: Record<string, string>;
}

export interface PlaceholderAttributes {
  label: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    placeholder: {
      /**
       * Insert a placeholder at the current position
       */
      insertPlaceholder: (attributes: PlaceholderAttributes) => ReturnType;
    };
  }
}

export const Placeholder = Node.create<PlaceholderOptions>({
  name: "fieldPlaceholder",

  inline: true,
  group: "inline",
  content: "text*",
  atom: false,
  selectable: true,

  addOptions() {
    return {
      addNodeView: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") || "",
        renderHTML: (attributes) => {
          if (!attributes.label) {
            return {};
          }
          return {
            "data-label": attributes.label,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-placeholder]",
        getAttrs: (element) => ({
          label: (element as HTMLElement).getAttribute("data-label") || "",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-placeholder": "",
        class: "placeholder",
        ...HTMLAttributes,
      },
      0,
    ];
  },

  addCommands() {
    return {
      insertPlaceholder:
        (attributes) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                label: attributes.label,
              },
              content: [
                {
                  type: "text",
                  text: attributes.label,
                },
              ],
            })
            .run();
        },
    };
  },

  addNodeView() {
    return this.options.addNodeView?.() ?? null;
  },
});
