import { Extension } from "@tiptap/core";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Mention } from "@tiptap/extension-mention";
import StarterKit from "@tiptap/starter-kit";

export interface GetChatEditorExtensionsOptions {
  onEnter?: () => void;
  placeholder?: string;
  mentionSuggestion?: any;
}

function createEnterExtension(onEnter?: () => void) {
  return Extension.create({
    name: "chatEnter",
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

export function getChatEditorExtensions(
  options?: GetChatEditorExtensionsOptions
) {
  const extensions = [
    StarterKit.configure({
      link: false,
    }),
    Placeholder.configure({
      placeholder:
        options?.placeholder ?? "Ask anything. Use @ to refer to documents",
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
