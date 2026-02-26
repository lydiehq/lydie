import { createId } from "@lydie/core/id";
import type { NodeViewRenderer } from "@tiptap/core";
import { Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";

function addMissingBlockIds(doc: ProseMirrorNode, tr: Transaction): boolean {
  let didUpdate = false;

  doc.descendants((node, pos) => {
    if (node.type.name !== "collectionViewBlock") {
      return;
    }

    if (typeof node.attrs.blockId === "string" && node.attrs.blockId.length > 0) {
      return;
    }

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      blockId: createId(),
    });
    didUpdate = true;
  });

  return didUpdate;
}

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

  onCreate() {
    const tr = this.editor.state.tr;
    if (addMissingBlockIds(this.editor.state.doc, tr)) {
      this.editor.view.dispatch(tr);
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const tr = newState.tr;
          if (!addMissingBlockIds(newState.doc, tr)) {
            return null;
          }

          return tr;
        },
      }),
    ];
  },
});
