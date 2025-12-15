import { Extension } from "@tiptap/core";

interface KeyboardShortcutOptions {
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

    // addKeyboardShortcuts() {
    //   return {
    //     "Mod-k": () => {
    //       this.options.onAddLink?.();
    //       return true;
    //     },
    //   };
    // },
  });
