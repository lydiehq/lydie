import { Extension } from "@tiptap/core";

export interface KeyboardShortcutOptions {
  onAddLink?: () => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    keyboardShortcuts: {
      openLinkDialog: () => ReturnType;
    };
  }
}

export const KeyboardShortcutExtension = Extension.create<KeyboardShortcutOptions>({
  name: "keyboardShortcuts",

  addOptions() {
    return {
      onAddLink: undefined,
    };
  },

  addCommands() {
    return {
      openLinkDialog: () => () => {
        this.options.onAddLink?.();
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        const { state } = this.editor;
        const { from, to } = state.selection;
        const hasSelection = from !== to;

        // Only handle if text is selected AND we have a link handler
        if (hasSelection && this.options.onAddLink) {
          this.options.onAddLink();
          // Return true to prevent the command menu from opening
          return true;
        }

        // Otherwise, return false to let the event bubble up
        // so the command menu can handle it
        return false;
      },
    };
  },
});
