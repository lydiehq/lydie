import { base64ToUint8Array } from "@lydie/core/lib/base64";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { getDocumentEditorExtensions } from "@lydie/editor";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo } from "react";
import * as Y from "yjs";

interface Props {
  yjsState: string;
}

export function VersionPreviewEditor({ yjsState }: Props) {
  // Convert Yjs state to initial content for the editor
  const initialContent = useMemo(() => {
    try {
      // Create a temporary Y.Doc and apply the state
      const ydoc = new Y.Doc();
      const update = base64ToUint8Array(yjsState);
      Y.applyUpdate(ydoc, update);

      // Convert to JSON for TipTap
      return convertYjsToJson(yjsState);
    } catch (error) {
      console.error("Failed to parse Yjs state:", error);
      return { type: "doc", content: [] };
    }
  }, [yjsState]);

  const editor = useEditor({
    editable: false,
    content: initialContent,
    extensions: getDocumentEditorExtensions({}),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none p-8 outline-none",
      },
    },
  });

  // Update editor content when yjsState changes
  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  if (!editor) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="h-full">
      <EditorContent editor={editor} />
    </div>
  );
}
