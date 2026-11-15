import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// Caret moves ProseMirror leaves to the browser, with the side they head to.
const NATIVE_MOVES: Record<string, 1 | -1> = { End: 1, PageDown: 1, Home: -1, PageUp: -1 };
const ARROWS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

// From a selected inline node (a clicked wiki link, inline math) the browser starts these moves
// from a hidden caret beside the node and ProseMirror keeps the node selected, so End then typing
// replaced the node. Collapse to the side the move heads to (with Shift, the other side, so the
// node stays in the extended selection) and let the browser move from there. Plain Left and Right
// are ProseMirror's own and left alone.
function collapseBeforeNativeMove(view: EditorView, event: KeyboardEvent) {
  const sel = view.state.selection;
  if (!(sel instanceof NodeSelection) || !sel.node.isInline) return false;
  const modified = event.metaKey || event.ctrlKey || event.altKey;
  const dir =
    NATIVE_MOVES[event.key] ??
    (event.key === "ArrowUp" || event.key === "ArrowDown" || modified
      ? ARROWS[event.key]
      : undefined);
  if (!dir) return false;
  const forward = event.shiftKey ? dir < 0 : dir > 0;
  view.dispatch(view.state.tr.setSelection(new TextSelection(forward ? sel.$to : sel.$from)));
  return false;
}

export type KeyboardShortcutsOptions = {
  // Opens the host's link editor. v1 set an empty link mark to signal its popover; v2 calls back.
  onOpenLink: ((editor: Editor) => void) | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    keyboardShortcuts: {
      openLinkEditor: () => ReturnType;
    };
  }
}

export const KeyboardShortcuts = Extension.create<KeyboardShortcutsOptions>({
  name: "keyboardShortcuts",

  addOptions() {
    return { onOpenLink: null };
  },

  addCommands() {
    return {
      openLinkEditor:
        () =>
        ({ editor }) => {
          if (!this.options.onOpenLink) return false;
          this.options.onOpenLink(editor);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        // Without a link editor, leave the selection alone and let Mod-k bubble.
        if (!this.options.onOpenLink) return false;
        const { from, to } = this.editor.state.selection;
        if (this.editor.isActive("link") && from === to) {
          return this.editor.chain().extendMarkRange("link").openLinkEditor().run();
        }
        if (from !== to) return this.editor.commands.openLinkEditor();
        // Let it bubble so the host's command palette can use Mod-k.
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("nativeCaretMoves"),
        props: { handleKeyDown: collapseBeforeNativeMove },
      }),
    ];
  },
});
