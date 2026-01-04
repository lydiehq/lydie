import { useEditor, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { Heading } from "@tiptap/extension-heading";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useCallback } from "react";
import { KeyboardShortcutExtension } from "./extensions/keyboard-shortcuts";

export type TitleEditorHookResult = {
  editor: Editor;
  setContent: (title: string) => void;
};

export interface UseTitleEditorOptions {
  initialTitle?: string;
  onUpdate?: (title: string) => void;
  onEnter?: () => void;
  editable?: boolean;
}

export function useTitleEditor({
  initialTitle = "",
  onUpdate,
  onEnter,
  editable = true,
}: UseTitleEditorOptions): TitleEditorHookResult {
  const PreventBreakExtension = Extension.create({
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

  const editor = useEditor({
    autofocus: editable,
    editable,
    extensions: [
      UndoRedo,
      Document,
      Text,
      Heading.configure({ levels: [1] }),
      Placeholder.configure({
        placeholder: "What's the title?",
        emptyEditorClass: "is-editor-empty",
      }),
      PreventBreakExtension,
      KeyboardShortcutExtension,
    ],
    content: initialTitle
      ? {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: initialTitle }],
            },
          ],
        }
      : {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [],
            },
          ],
        },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.state.doc.textContent);
    },
    editorProps: {
      attributes: {
        class: "editor-content focus:outline-none",
      },
    },
  });

  const setContent = useCallback(
    (title: string) => {
      if (!editor) return;
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: title ? [{ type: "text", text: title }] : [],
          },
        ],
      });
    },
    [editor]
  );

  return { editor, setContent };
}

