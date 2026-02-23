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
      viewId: {
        default: null,
      },
      blockId: {
        default: null,
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
