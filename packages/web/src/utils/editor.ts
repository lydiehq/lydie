import { useEditor, Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextSelectionExtension } from "@/editor/extensions/selection";
import { MarkdownPasteExtension } from "@/editor/extensions/markdown-paste";
import { CharacterCount } from "@tiptap/extension-character-count";
import { DocumentComponent } from "../editor/extensions/document-components";
import { KeyboardShortcutExtension } from "@/editor/extensions/keyboard-shortcuts";
import { useCallback } from "react";
import { TableKit } from "@tiptap/extension-table";

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
