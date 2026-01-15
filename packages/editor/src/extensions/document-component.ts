import { Node } from "@tiptap/core";
import type { NodeViewRenderer } from "@tiptap/core";

export interface DocumentComponentOptions {
  addNodeView?: () => NodeViewRenderer;
}

export const DocumentComponent = Node.create<DocumentComponentOptions>({
  name: "documentComponent",
  group: "block",
  content: "inline*",
  atom: true,

  addOptions() {
    return {
      addNodeView: undefined,
    };
  },

  addAttributes() {
    return {
      name: {
        default: "",
      },
      properties: {
        default: {},
      },
      schemas: {
        default: {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "documentComponent",
        getAttrs: (node) => ({
          name: (node as HTMLElement).getAttribute("data-name"),
          properties: JSON.parse(
            (node as HTMLElement).getAttribute("data-properties") || "{}"
          ),
          schemas: JSON.parse(
            (node as HTMLElement).getAttribute("data-schemas") || "{}"
          ),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "documentComponent",
      {
        "data-name": node.attrs.name,
        "data-properties": JSON.stringify(node.attrs.properties),
        "data-schemas": JSON.stringify(node.attrs.schemas),
      },
    ];
  },

  addNodeView() {
    return this.options.addNodeView?.();
  },
});

