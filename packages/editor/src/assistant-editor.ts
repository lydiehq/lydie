import { Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import { Mention } from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import { Placeholder } from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";

export interface GetAssistantEditorExtensionsOptions {
  onEnter?: () => void;
  placeholder?: string;
  mentionSuggestion?: any;
}

function createEnterExtension(onEnter?: () => void) {
  return Extension.create({
    name: "assistantEnter",
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          onEnter?.();
          return true;
        },
        "Shift-Enter": () => {
          return this.editor.commands.setHardBreak();
        },
      };
    },
  });
}

export function getAssistantEditorExtensions(options?: GetAssistantEditorExtensionsOptions) {
  const extensions = [
    Document,
    Text,
    Paragraph,
    HardBreak,
    UndoRedo,
    Placeholder.configure({
      placeholder: options?.placeholder ?? "Ask anything. Use @ to refer to documents",
      emptyEditorClass: "is-editor-empty",
    }),
    createEnterExtension(options?.onEnter),
    Mention.configure({
      HTMLAttributes: {
        class: "mention bg-blue-100 text-blue-800 px-1 rounded",
      },
      renderText({ node }) {
        return `[reference_document:id:${node.attrs.id}]`;
      },
      suggestion: options?.mentionSuggestion,
    }),
  ];

  return extensions;
}
