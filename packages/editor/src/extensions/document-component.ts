import type { NodeViewRenderer } from "@tiptap/core";
import { Node } from "@tiptap/core";

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
      types: {
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
          properties: JSON.parse((node as HTMLElement).getAttribute("data-properties") || "{}"),
          schemas: JSON.parse((node as HTMLElement).getAttribute("data-schemas") || "{}"),
          types: JSON.parse((node as HTMLElement).getAttribute("data-types") || "{}"),
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
        "data-types": JSON.stringify(node.attrs.types),
      },
    ];
  },

  addNodeView() {
    return this.options.addNodeView?.() ?? null;
  },
});
