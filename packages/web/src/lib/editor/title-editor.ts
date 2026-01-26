import { getTitleExtensions } from "@lydie/editor";
import { Editor, useEditor } from "@tiptap/react";
import { useCallback, useMemo } from "react";

export type TitleEditorHookResult = {
  editor: Editor | null;
  setContent: (title: string) => void;
};

export interface UseTitleEditorOptions {
  initialTitle?: string;
  onUpdate?: (title: string) => void;
  onEnter?: () => void;
  onBlur?: () => void;
  onCreate?: (editor: Editor) => void;
  onDestroy?: () => void;
  editable?: boolean;
  placeholder?: string;
}

export function useTitleEditor({
  initialTitle = "",
  onUpdate,
  onEnter,
  onBlur,
  onCreate,
  onDestroy,
  editable = true,
  placeholder,
}: UseTitleEditorOptions): TitleEditorHookResult {
  const extensions = useMemo(
    () => getTitleExtensions({ onEnter, placeholder }),
    [onEnter, placeholder],
  );

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
    onCreate: ({ editor }) => {
      onCreate?.(editor);
    },
    onDestroy: () => {
      onDestroy?.();
    },
    editorProps: {
      attributes: {
        class:
          "focus:outline-none text-[1.75rem] leading-[calc(2/1.75)] font-medium text-gray-950 py-4",
      },
      handleDOMEvents: {
        blur: () => {
          onBlur?.();
          return false;
        },
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
    [editor],
  );

  return { editor, setContent };
}
