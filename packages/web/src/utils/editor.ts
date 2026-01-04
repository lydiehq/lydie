import { useEditor, Editor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { getContentExtensions } from "@lydie/editor/content";
import { getTitleExtensions } from "@lydie/editor/title";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { CodeBlockComponent } from "@/components/CodeBlockComponent";
import { useCallback } from "react";

export type EditorHookResult = {
  editor: Editor;
  setContent: (content: string) => void;
};

export type TitleEditorHookResult = {
  editor: Editor | null;
  setContent: (title: string) => void;
};

export interface UseTitleEditorOptions {
  initialTitle?: string;
  onUpdate?: (title: string) => void;
  onEnter?: () => void;
  editable?: boolean;
  placeholder?: string;
}

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
  const extensions = getContentExtensions({
    textSelection: {
      onSelect: onTextSelect,
    },
    keyboardShortcuts: {
      onSave,
      onAddLink,
    },
    starterKit: {
      heading: {},
      link: {
        openOnClick: false,
        protocols: ["internal"],
      },
    },
    documentComponent: {
      addNodeView: () => ReactNodeViewRenderer(DocumentComponentComponent),
    },
    codeBlock: {
      addNodeView: () => ReactNodeViewRenderer(CodeBlockComponent),
    },
  });

  const editor = useEditor({
    autofocus: true,
    extensions,
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
  editable = true,
  placeholder,
}: UseTitleEditorOptions): TitleEditorHookResult {
  const extensions = getTitleExtensions({
    onEnter,
    placeholder,
  });

  const editor = useEditor({
    autofocus: editable,
    editable,
    extensions,
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
