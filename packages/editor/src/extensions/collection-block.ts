import type { NodeViewRenderer } from "@tiptap/core";
import { Node } from "@tiptap/core";

export interface CollectionBlockOptions {
  addNodeView?: () => NodeViewRenderer;
}

export const CollectionBlock = Node.create<CollectionBlockOptions>({
  name: "collectionBlock",
  group: "block",
  atom: true,

  addOptions() {
    return {
      addNodeView: undefined,
    };
  },

  addAttributes() {
    return {
      collectionId: {
        default: null,
      },
      filters: {
        default: {},
      },
      sortField: {
        default: null,
      },
      sortDirection: {
        default: "asc",
      },
      viewMode: {
        default: "table", // 'table' | 'list'
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="collection-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "collection-block", ...HTMLAttributes }];
  },

  addNodeView() {
    return this.options.addNodeView?.() || null;
  },
});
