import { useEditor, Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextSelectionExtension } from "@/editor/extensions/selection";
import { MarkdownPasteExtension } from "@/editor/extensions/markdown-paste";
import { CharacterCount } from "@tiptap/extension-character-count";
import { DocumentComponent } from "../editor/extensions/document-components";
import { KeyboardShortcutExtension } from "@/editor/extensions/keyboard-shortcuts";
import { IndentHandlerExtension } from "@/editor/extensions/indent-handler";
import { useCallback } from "react";
import { TableKit } from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Heading } from "@tiptap/extension-heading";
import { UndoRedo } from "@tiptap/extensions";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";

export type EditorHookResult = {
  editor: Editor;
  setContent: (content: string) => void;
};

export function useContentEditor({
  initialContent,
  onUpdate,
  onSave,
  onTextSelect,
  onAddLink,
}: {
  initialContent: any;
  documentId: string;
  onUpdate?: () => void;
  getApiClient: () => any;
  onSave?: () => void;
  onTextSelect?: (e: any) => void;
  onAddLink?: () => void;
}): EditorHookResult {
  const editor = useEditor({
    autofocus: true,
    extensions: [
      StarterKit.configure({
        heading: {},
        link: {
          openOnClick: false,
          protocols: ["internal"], // allow internal links
        },
      }),
      TableKit,
      CharacterCount,
      TextSelectionExtension.configure({
        onSelect: onTextSelect,
      }),
      MarkdownPasteExtension,
      KeyboardShortcutExtension.configure({
        onSave,
        onAddLink,
      }),
      DocumentComponent,
      IndentHandlerExtension,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "size-full outline-none editor-content",
      },
    },
    onUpdate,
  });

  const setContent = useCallback(
    (content: string) => {
      if (!editor) return;
      editor.commands.setContent(content);
    },
    [editor]
  );

  return { editor, setContent };
}

export function useTitleEditor({
  initialTitle = "",
  onUpdate,
  onEnter,
}: {
  initialTitle: string;
  onUpdate?: (title: string) => void;
  onEnter?: () => void;
}): EditorHookResult {
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
    autofocus: true,
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
