import type { NodeViewRenderer } from "@tiptap/core";
import { Node } from "@tiptap/core";

export interface CollectionViewBlockOptions {
  addNodeView?: () => NodeViewRenderer;
}

export const CollectionViewBlock = Node.create<CollectionViewBlockOptions>({
  name: "collectionViewBlock",
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
        tag: 'div[data-type="collection-view-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "collection-view-block", ...HTMLAttributes }];
  },

  addNodeView() {
    return this.options.addNodeView?.() || null;
  },
});
