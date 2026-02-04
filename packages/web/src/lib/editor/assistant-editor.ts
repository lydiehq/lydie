import { getAssistantEditorExtensions } from "@lydie/editor";
import { type Editor, useEditor } from "@tiptap/react";
import { useCallback, useMemo } from "react";
import tippy from "tippy.js";

import { MentionList } from "@/lib/editor/MentionList";

export type AssistantEditorDocument = {
  id: string;
  title?: string | null;
};

export interface UseAssistantEditorOptions {
  documents: AssistantEditorDocument[];
  onEnter?: () => void;
  onChange?: (editor: Editor) => void;
  placeholder?: string;
  initialContent?: string;
  editorClassName?: string;
}

export interface AssistantEditorHandle {
  editor: Editor | null;
  getTextContent: () => string;
  getHTMLContent: () => string;
  clearContent: () => void;
  setContent: (content: string) => void;
}

function createMentionSuggestion(items: Array<{ id: string; label: string }>) {
  return {
    allowSpaces: true,
    char: "@",
    items: ({ query }: { query: string }) => {
      return items
        .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10);
    },
    command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
      // Delete the range (@Text) and insert the mention
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "mention",
            attrs: props,
          },
          {
            type: "text",
            text: " ",
          },
        ])
        .run();
    },
    render() {
      let component: MentionList | null = null;
      let popup: any = null;

      return {
        onStart: (props: any) => {
          component = new MentionList({
            items: props.items,
            command: props.command,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: any) {
          component?.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          if (popup && popup[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            });
          }
        },

        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }

          return component?.onKeyDown(props) ?? false;
        },

        onExit() {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}

export function useAssistantEditor({
  documents,
  onEnter,
  onChange,
  placeholder = "Ask anything. Use @ to refer to documents",
  initialContent = "",
  editorClassName = "focus:outline-none min-h-[100px] max-h-[200px] overflow-y-auto text-sm text-gray-700",
}: UseAssistantEditorOptions): AssistantEditorHandle {
  const mentionItems = useMemo(() => {
    return documents.map((doc) => ({
      id: doc.id,
      label: doc.title || "Untitled document",
      type: "document",
    }));
  }, [documents]);

  const mentionSuggestion = useMemo(() => createMentionSuggestion(mentionItems), [mentionItems]);

  const extensions = useMemo(() => {
    return getAssistantEditorExtensions({
      placeholder,
      mentionSuggestion,
      onEnter,
    });
  }, [placeholder, mentionSuggestion, onEnter]);

  const editor = useEditor({
    extensions,
    content: initialContent,
    editorProps: {
      attributes: {
        class: editorClassName,
      },
    },
    onUpdate: onChange ? ({ editor }) => onChange(editor) : undefined,
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
    [editor],
  );

  return {
    editor,
    getTextContent,
    getHTMLContent,
    clearContent,
    setContent,
  };
}
