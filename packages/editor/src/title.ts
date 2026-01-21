import { Extension } from "@tiptap/core"
import { UndoRedo } from "@tiptap/extensions"
import { Document } from "@tiptap/extension-document"
import { Text } from "@tiptap/extension-text"
import { Heading } from "@tiptap/extension-heading"
import { Placeholder } from "@tiptap/extension-placeholder"
import { KeyboardShortcutExtension } from "./extensions/keyboard-shortcuts"

export interface GetTitleExtensionsOptions {
  onEnter?: () => void
  placeholder?: string
}

function createPreventBreakExtension(onEnter?: () => void) {
  return Extension.create({
    name: "preventBreak",
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          onEnter?.()
          return true
        },
        "Shift-Enter": () => true,
      }
    },
  })
}

export function getTitleExtensions(options?: GetTitleExtensionsOptions) {
  return [
    UndoRedo,
    Document,
    Text,
    Heading.configure({ levels: [1] }),
    Placeholder.configure({
      placeholder: options?.placeholder ?? "What's the title?",
      emptyEditorClass: "is-editor-empty",
    }),
    createPreventBreakExtension(options?.onEnter),
    KeyboardShortcutExtension,
  ]
}
