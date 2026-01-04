import { useEditor, Editor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { getContentExtensions } from "@lydie/editor/content";
import { useTitleEditor } from "@lydie/editor/title";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { useCallback } from "react";

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
  const extensions = getContentExtensions({
    textSelection: {
      enabled: true,
      onSelect: onTextSelect,
    },
    keyboardShortcuts: {
      enabled: true,
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
      enabled: true,
      addNodeView: () => ReactNodeViewRenderer(DocumentComponentComponent),
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

export { useTitleEditor } from "@lydie/editor/title";
