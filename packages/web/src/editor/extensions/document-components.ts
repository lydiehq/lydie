import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export const DocumentComponent = Node.create({
  name: "documentComponent",
  group: "block",
  content: "inline*",
  atom: true,

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
          name: node.getAttribute("data-name"),
          properties: JSON.parse(node.getAttribute("data-properties") || "{}"),
          schemas: JSON.parse(node.getAttribute("data-schemas") || "{}"),
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
    return ReactNodeViewRenderer(DocumentComponentComponent);
  },
});
