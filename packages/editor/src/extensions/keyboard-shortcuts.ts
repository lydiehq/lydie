import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    keyboardShortcuts: {
      // Open the link popover by setting an empty link mark.
      openLinkPopover: () => ReturnType;
    };
  }
}

export const KeyboardShortcutExtension = Extension.create({
  name: "keyboardShortcuts",

  addCommands() {
    return {
      openLinkPopover:
        () =>
        ({ commands }) => {
          // Set an empty link mark to trigger the popover in edit mode
          return commands.setLink({ href: "" });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        const { state } = this.editor;
        const { from, to } = state.selection;
        const hasSelection = from !== to;
        const isLinkActive = this.editor.isActive("link");

        // If we're on a link (even without selection), select the entire link and open edit mode
        if (isLinkActive && !hasSelection) {
          return (
            this.editor.commands.extendMarkRange("link") && this.editor.commands.openLinkPopover()
          );
        }

        // If text is selected, open link popover
        if (hasSelection) {
          return this.editor.commands.openLinkPopover();
        }

        // Otherwise, return false to let the event bubble up
        // so the command menu can handle it
        return false;
      },
    };
  },
});
