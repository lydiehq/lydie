import { Extension } from "@tiptap/core";

export interface KeyboardShortcutOptions {
  onSave?: () => void;
  onAddLink?: () => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    keyboardShortcuts: {
      save: () => ReturnType;
      openLinkDialog: () => ReturnType;
    };
  }
}

export const KeyboardShortcutExtension =
  Extension.create<KeyboardShortcutOptions>({
    name: "keyboardShortcuts",

    addOptions() {
      return {
        onSave: undefined,
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
  });

