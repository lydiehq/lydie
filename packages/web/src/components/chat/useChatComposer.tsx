import { useEditor, type Editor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Mention } from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, useCallback } from "react";
import tippy from "tippy.js";

export type ChatComposerDocument = {
  id: string;
  title?: string | null;
};

export interface UseChatComposerOptions {
  documents: ChatComposerDocument[];
  onEnter?: () => void;
  placeholder?: string;
}

export interface ChatComposerHandle {
  editor: Editor | null;
  getTextContent: () => string;
  getHTMLContent: () => string;
  clearContent: () => void;
  setContent: (content: string) => void;
}

export function useChatComposer({
  documents,
  onEnter,
  placeholder = "Ask anything. Use @ to refer to other elements",
}: UseChatComposerOptions): ChatComposerHandle {
  const mentionItems = useMemo(() => {
    return documents.map((doc) => ({
      id: doc.id,
      label: doc.title || "Untitled document",
      type: "document",
    }));
  }, [documents]);

  const EnterExtension = Extension.create({
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          onEnter?.();
          return true;
        },
        "Shift-Enter": () => {
          return this.editor.commands.setHardBreak();
        },
      };
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention bg-blue-100 text-blue-800 px-1 rounded",
        },
        renderText({ node }) {
          return `[reference_document:id:${node.attrs.id}]`;
        },
        suggestion: createMentionSuggestion(mentionItems),
      }),
      EnterExtension,
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "focus:outline-none min-h-[100px] max-h-[200px] overflow-y-auto text-sm text-gray-700",
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

  return {
    editor,
    getTextContent,
    getHTMLContent,
    clearContent,
    setContent,
  };
}

function createMentionSuggestion(items: Array<{ id: string; label: string }>) {
  return {
    allowSpaces: true,
    char: "@",
    items: ({ query }: { query: string }) => {
      return items
        .filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 10);
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

class MentionList {
  items: any[];
  command: any;
  element: HTMLElement;
  selectedIndex: number;

  constructor({ items, command }: { items: any[]; command: any }) {
    this.items = items;
    this.command = command;
    this.selectedIndex = 0;

    this.element = document.createElement("div");
    this.element.className =
      "bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-60 overflow-y-auto z-50";
    this.render();
  }

  render() {
    this.element.innerHTML = "";

    this.items.forEach((item, index) => {
      const itemElement = document.createElement("div");
      itemElement.className = `px-3 py-2 cursor-pointer rounded text-sm ${
        index === this.selectedIndex
          ? "bg-blue-100 text-blue-800"
          : "text-gray-700 hover:bg-gray-100"
      }`;
      itemElement.textContent = item.label;
      itemElement.addEventListener("click", () => {
        this.command(item);
      });
      this.element.appendChild(itemElement);
    });
  }

  updateProps(props: any) {
    this.items = props.items;
    this.selectedIndex = 0;
    this.render();
  }

  onKeyDown({ event }: { event: KeyboardEvent }) {
    if (event.key === "ArrowUp") {
      this.selectedIndex =
        (this.selectedIndex + this.items.length - 1) % this.items.length;
      this.render();
      return true;
    }

    if (event.key === "ArrowDown") {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.render();
      return true;
    }

    if (event.key === "Enter") {
      this.command(this.items[this.selectedIndex]);
      return true;
    }

    return false;
  }

  destroy() {
    this.element.remove();
  }
}
