import { useEditor, Editor } from "@tiptap/react";
import { getChatEditorExtensions } from "@lydie/editor/chat-editor";
import { useCallback } from "react";

export type ChatEditorHookResult = {
  editor: Editor | null;
  getTextContent: () => string;
  getHTMLContent: () => string;
  clearContent: () => void;
  setContent: (content: string) => void;
};

export interface UseChatEditorOptions {
  onEnter?: () => void;
  placeholder?: string;
  mentionSuggestion?: any;
}

export function useChatEditor({
  onEnter,
  placeholder,
  mentionSuggestion,
}: UseChatEditorOptions): ChatEditorHookResult {
  const extensions = getChatEditorExtensions({
    onEnter,
    placeholder,
    mentionSuggestion,
  });

  const editor = useEditor({
    autofocus: false,
    editable: true,
    extensions,
    content: "",
    editorProps: {
      attributes: {
        class: "focus:outline-none text-sm text-gray-700",
      },
    },
  });

  const getTextContent = useCallback(() => {
    if (!editor) return "";
    return editor.getText();
  }, [editor]);

  const getHTMLContent = useCallback(() => {
    if (!editor) return "";
    return editor.getHTML();
  }, [editor]);

  const clearContent = useCallback(() => {
    if (!editor) return;
    editor.commands.clearContent();
  }, [editor]);

  const setContent = useCallback(
    (content: string) => {
      if (!editor) return;
      editor.commands.setContent(content);
    },
    [editor]
  );

  return { editor, getTextContent, getHTMLContent, clearContent, setContent };
}
