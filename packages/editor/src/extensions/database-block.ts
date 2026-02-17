import type { NodeViewRenderer } from "@tiptap/core";
import { Node } from "@tiptap/core";

export interface DatabaseBlockOptions {
  addNodeView?: () => NodeViewRenderer;
}

export const DatabaseBlock = Node.create<DatabaseBlockOptions>({
  name: "databaseBlock",
  group: "block",
  atom: true,

  addOptions() {
    return {
      addNodeView: undefined,
    };
  },

  addAttributes() {
    return {
      sourcePageId: {
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
        tag: 'div[data-type="database-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "database-block", ...HTMLAttributes }];
  },

  addNodeView() {
    return this.options.addNodeView?.() || null;
  },
});
