import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const selectionMarkKey = new PluginKey("selectionMark");

export interface TextSelectionOptions {
  // The keyboard shortcut to trigger text selection (default: 'Mod-l')
  shortcut: string;

  // Function to call when text is selected
  onSelect?: (text: string) => void;

  // CSS class to apply to marked selections (default: 'text-selection-mark')
  markClass?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textSelection: {
      // Single command to handle both capturing and marking
      captureAndMarkSelection: () => ReturnType;

      // Keep this to clear selections
      clearSelection: () => ReturnType;

      // Jump to the saved selection
      jumpToSelection: () => ReturnType;
    };
  }
}

// Extension that allows capturing text selections with a keyboard shortcut
export const TextSelectionExtension = Extension.create<TextSelectionOptions>({
  name: "textSelection",

  addOptions() {
    return {
      shortcut: "Mod-l",
      onSelect: undefined,
      markClass: "text-selection-mark",
    };
  },

  // Store selection state in the extension
  addStorage() {
    return {
      selectedText: null,
      selectionRange: null,
    };
  },

  addCommands() {
    return {
      captureAndMarkSelection:
        () =>
        ({ state, dispatch }) => {
          // First clear any existing selection
          this.editor.commands.clearSelection();

          const { from, to } = state.selection;

          if (from === to) return false;

          const selectedText = state.doc.textBetween(from, to, " ");

          if (selectedText && selectedText.trim()) {
            // Store the selection details
            this.storage.selectedText = selectedText;
            this.storage.selectionRange = { from, to };

            // Call the callback
            if (this.options.onSelect) {
              this.options.onSelect(selectedText);
            }

            // Apply the mark
            if (dispatch) {
              const tr = state.tr.setMeta(selectionMarkKey, {
                add: true,
                from,
                to,
                class: this.options.markClass,
              });

              dispatch(tr);
              return true;
            }
          }

          return false;
        },

      clearSelection:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            // Clear storage
            this.storage.selectedText = null;
            this.storage.selectionRange = null;

            // Clear decorations
            const tr = state.tr.setMeta(selectionMarkKey, { remove: true });
            dispatch(tr);
            return true;
          }

          return false;
        },

      jumpToSelection:
        () =>
        ({ state, dispatch, view }) => {
          const range = this.storage.selectionRange;

          if (!range) return false;

          if (dispatch) {
            // Create a text selection at the stored range
            const { from, to } = range;
            const selection = TextSelection.create(state.doc, from, to);

            // Create a transaction that selects the text
            const tr = state.tr.setSelection(selection);

            // Apply the transaction
            dispatch(tr);

            // Scroll the selection into view and focus
            view.focus();

            // Ensure the selection is visible
            setTimeout(() => {
              const domSelection = window.getSelection();
              const node = domSelection?.anchorNode;
              if (node)
                node.parentElement?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
            }, 0);

            return true;
          }

          return false;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      [this.options.shortcut]: () => this.editor.commands.captureAndMarkSelection(),
    };
  },
  addProseMirrorPlugins() {
    const pluginKey = selectionMarkKey;

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            // Map decorations to handle document changes
            const newSet = oldSet.map(tr.mapping, tr.doc);

            const meta = tr.getMeta(pluginKey);
            if (meta) {
              if (meta.add) {
                const decoration = Decoration.inline(meta.from, meta.to, {
                  class: meta.class,
                });
                return newSet.add(tr.doc, [decoration]);
              }

              if (meta.remove) {
                return DecorationSet.empty;
              }
            }

            return newSet;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
