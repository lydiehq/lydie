import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

const TAB_CHAR = "\u0009";

// Tab and Shift-Tab on a selected node (Escape, a click on an image or embed, the drag handle).
// Typing a tab over the selection would replace the node (LYD-378), so it never does: a list
// item indents or outdents and stays selected, an inline node keeps its place and gets the tab
// after it. Other blocks: Tab does nothing (focus stays in the editor) and Shift-Tab passes to the
// host, as with nothing to outdent. (A selected table is a CellSelection of all its cells, see
// `wholeTable`.)
function tabOnSelectedNode(editor: Editor, selection: NodeSelection, outdent: boolean) {
  const { node, from, to } = selection;
  const { state, view } = editor;
  if (node.isInline) {
    if (outdent) return false;
    const tr = state.tr.insertText(TAB_CHAR, to);
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, to + TAB_CHAR.length)));
    return true;
  }
  const type = node.type;
  if (type.name === "listItem" || type.name === "taskItem") {
    // The list commands act on the caret's item: run them from inside it, then select it again.
    const inside = state.apply(state.tr.setSelection(Selection.near(state.doc.resolve(from + 1))));
    let moved: Transaction | null = null;
    (outdent ? liftListItem(type) : sinkListItem(type))(inside, (tr) => (moved = tr));
    if (moved) {
      const tr = moved as Transaction;
      const $caret = tr.selection.$from;
      for (let depth = $caret.depth; depth > 0; depth--) {
        if ($caret.node(depth).type === type) {
          tr.setSelection(NodeSelection.create(tr.doc, $caret.before(depth)));
          break;
        }
      }
      view.dispatch(tr);
    }
    // A first item has nothing to indent under; it stays as it is.
    return moved !== null || !outdent;
  }
  return !outdent;
}

// Escape selects a table as all of its cells (prosemirror-tables turns a table NodeSelection into
// that). Tab there goes into the first cell; the table's own Tab would add a row after the last.
const wholeTable = (selection: Selection): selection is CellSelection =>
  selection instanceof CellSelection && selection.isRowSelection() && selection.isColSelection();

// Ported from v1. Tab at the start of a list item nests it, otherwise inserts a tab character
// (keeping focus in the editor). Shift-Tab lifts the item or removes a preceding tab, and otherwise
// passes. v2 also handles task items, and a selected node (`tabOnSelectedNode`).
export const IndentHandler = Extension.create({
  name: "indentHandler",

  addKeyboardShortcuts() {
    const itemType = () =>
      this.editor.isActive("taskItem")
        ? "taskItem"
        : this.editor.isActive("listItem")
          ? "listItem"
          : null;

    return {
      Tab: ({ editor }) => {
        const { selection } = editor.state;
        if (selection instanceof NodeSelection) return tabOnSelectedNode(editor, selection, false);
        if (wholeTable(selection)) {
          // Just inside the table: its first row, whose first cell holds the caret.
          const first = Selection.near(editor.state.doc.resolve(selection.$anchorCell.start(-1)));
          editor.view.dispatch(editor.state.tr.setSelection(first));
          return true;
        }
        const { $from } = selection;
        const item = itemType();
        if (item && $from.parentOffset === 0 && editor.chain().sinkListItem(item).run()) {
          return true;
        }
        if (editor.isActive("table")) return false;
        editor
          .chain()
          .command(({ tr }) => {
            tr.insertText(TAB_CHAR);
            return true;
          })
          .run();
        return true;
      },
      "Shift-Tab": ({ editor }) => {
        const { selection, doc } = editor.state;
        if (selection instanceof NodeSelection) return tabOnSelectedNode(editor, selection, true);
        const { $from } = selection;
        const pos = $from.pos;
        const item = itemType();
        if (item && $from.parentOffset === 0) {
          return editor.chain().liftListItem(item).run();
        }
        if (editor.isActive("table")) return false;
        if (pos > 0 && doc.textBetween(pos - 1, pos) === TAB_CHAR) {
          editor
            .chain()
            .command(({ tr }) => {
              tr.delete(pos - 1, pos);
              return true;
            })
            .run();
          return true;
        }
        // Nothing to outdent: let the host take it (the doc view moves to the title).
        return false;
      },
    };
  },
});
