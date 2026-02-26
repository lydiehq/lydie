import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useState } from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";

type MentionItem = {
  id: string;
  title: string | null;
};

type MentionMenuProps = {
  items: MentionItem[];
  command: (item: MentionItem) => void;
};

// Global store for mention search results
class MentionStore {
  private results: MentionItem[] = [];
  private listeners: Set<() => void> = new Set();

  setResults(results: MentionItem[]) {
    this.results = results;
    this.listeners.forEach((listener) => listener());
  }

  getResults(): MentionItem[] {
    return this.results;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const mentionStore = new MentionStore();

export const MentionMenuList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  MentionMenuProps
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = Math.min(selectedIndex, Math.max(props.items.length - 1, 0));

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    if (props.items.length === 0) return;
    setSelectedIndex((index) => (index + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    if (props.items.length === 0) return;
    setSelectedIndex((index) => (index + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(activeIndex);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-popover border border-gray-200 p-2 min-w-[200px]">
        <div className="text-xs text-gray-500 px-2 py-1">No documents found</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-popover border border-gray-200 p-1 min-w-[280px] max-h-[400px] overflow-y-auto">
      <div className="text-xs text-gray-500 px-2 py-1 mb-1">Link to document</div>
      {props.items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => selectItem(index)}
          className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 text-sm transition-colors ${
            index === activeIndex ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50"
          }`}
          type="button"
        >
          <div className="shrink-0 size-5 flex items-center justify-center text-gray-600">
            <DocumentIcon className="size-4" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-medium truncate">{item.title || "Untitled document"}</span>
          </div>
        </button>
      ))}
    </div>
  );
});

MentionMenuList.displayName = "MentionMenuList";

export function createMentionMenuSuggestion() {
  return {
    items: ({ query }: { query: string }) => {
      const results = mentionStore.getResults();
      // Filter search results based on query
      if (!query) return results.slice(0, 10);
      return results
        .filter((item) => (item.title || "").toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10);
    },

    render: () => {
      let component: ReactRenderer<
        React.ForwardRefExoticComponent<
          MentionMenuProps &
            React.RefAttributes<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }>
        >
      >;
      let popup: TippyInstance[];
      let isActive = false;

      return {
        onStart: (props: SuggestionProps) => {
          if (props.editor.isDestroyed) {
            return;
          }

          isActive = true;
          component = new ReactRenderer(MentionMenuList, {
            props: {
              items: props.items as MentionItem[],
              command: props.command as (item: MentionItem) => void,
            },
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: SuggestionProps) {
          if (!isActive) return;

          component.updateProps({
            items: props.items as MentionItem[],
            command: props.command as (item: MentionItem) => void,
          });

          if (!props.clientRect) {
            return;
          }

          popup[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown(props: SuggestionKeyDownProps) {
          if (!isActive) return false;

          if (props.event.key === "Escape") {
            popup[0]?.hide();
            return true;
          }

          return component.ref?.onKeyDown(props) || false;
        },

        onExit() {
          isActive = false;
          popup[0]?.destroy();
          component.destroy();
        },
      };
    },
  };
}

export function getMentionCommandAction(item: MentionItem, editor: Editor, range: Range) {
  return () => {
    // Delete the @ character and any query text
    editor.chain().focus().deleteRange(range).run();

    // Insert the link to the document
    const internalLink = `internal://${item.id}`;
    const displayText = item.title || "Untitled document";

    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: displayText,
        marks: [{ type: "link", attrs: { href: internalLink } }],
      })
      .run();
  };
}
