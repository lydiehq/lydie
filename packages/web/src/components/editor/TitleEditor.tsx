import { EditorContent, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import { KeyboardShortcutExtension } from "@/editor/extensions/keyboard-shortcuts";
import StarterKit from "@tiptap/starter-kit";

interface TitleEditorProps {
  initialTitle?: string;
  onBlur?: (title: string) => void;
  onSave?: (title: string) => void;
  autoFocus?: boolean;
  onEnter?: () => void;
}

export function TitleEditor({
  initialTitle = "",
  onBlur,
  onSave,
  autoFocus = false,
  onEnter,
}: TitleEditorProps) {
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
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1],
        },
      }),
      Placeholder.configure({
        placeholder: "What's the title?",
      }),
      PreventBreakExtension,
      KeyboardShortcutExtension.configure({
        onSave: () => onSave?.(editor?.state.doc.textContent || ""),
      }),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: initialTitle ? [{ type: "text", text: initialTitle }] : [],
        },
      ],
    },
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: "editor-content focus:outline-none",
      },
      handleDOMEvents: {
        blur: (view) => {
          const title = view.state.doc.textContent;
          onBlur?.(title);
          return false;
        },
      },
    },
  });

  return <EditorContent editor={editor} />;
}
