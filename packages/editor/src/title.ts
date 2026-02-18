import { Extension } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";

import { KeyboardShortcutExtension } from "./extensions/keyboard-shortcuts";

export interface GetTitleExtensionsOptions {
  onEnter?: () => void;
  placeholder?: string;
}

function createPreventBreakExtension(onEnter?: () => void) {
  return Extension.create({
    name: "preventBreak",
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          onEnter?.();
          return true;
        },
        "Shift-Enter": () => true,
      };
    },
  });
}

export function getTitleExtensions(options?: GetTitleExtensionsOptions) {
  return [
    UndoRedo,
    Document,
    Text,
    Heading.configure({ levels: [1] }),
    Placeholder.configure({
      placeholder: options?.placeholder ?? "Untitled",
      emptyEditorClass: "is-editor-empty",
    }),
    createPreventBreakExtension(options?.onEnter),
    KeyboardShortcutExtension,
  ];
}
