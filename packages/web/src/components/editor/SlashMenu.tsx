import { LayoutRowTwoRegular, ListFilled, TextNumberListLtrFilled } from "@fluentui/react-icons";
import {
  BoldIcon,
  CodeIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  ImageIcon,
  ItalicIcon,
  TableIcon,
  TaskListIcon,
} from "@lydie/ui/components/icons/wysiwyg-icons";
import { queries } from "@lydie/zero/queries";
import type { Schema } from "@lydie/zero/schema";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Zero } from "@rocicorp/zero";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";

import { allFormattingActions, type FormattingAction } from "@/lib/editor/formatting-actions";

type SlashMenuItem = {
  id: string;
  label: string;
  description?: string;
  icon: any;
  action: FormattingAction;
};

const iconMap: Record<string, any> = {
  paragraph: null,
  heading1: H1Icon,
  heading2: H2Icon,
  heading3: H3Icon,
  heading4: H3Icon,
  heading5: H3Icon,
  bold: BoldIcon,
  italic: ItalicIcon,
  code: CodeIcon,
  bulletList: ListFilled,
  orderedList: TextNumberListLtrFilled,
  taskList: TaskListIcon,
  table: TableIcon,
  image: ImageIcon,
  collection: TableIcon, // Using TableIcon as collection icon
};

// Filter out text formatting actions (bold, italic, strike) from slash menu
// These should only be accessible via toolbar or keyboard shortcuts
// Note: "code" is excluded because it needs context (selection) to determine inline vs block
const excludedSlashMenuIds = new Set(["bold", "italic", "strike"]);

const slashMenuItems: SlashMenuItem[] = allFormattingActions
  .filter((action) => !excludedSlashMenuIds.has(action.id))
  .map((action) => ({
    id: action.id,
    label: action.label,
    icon: iconMap[action.id],
    action,
  }));

type SlashMenuProps = {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
};

export const SlashMenuList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  SlashMenuProps
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
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
        <div className="text-xs text-gray-500 px-2 py-1">No results</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-popover border border-gray-200 p-1 min-w-[280px] max-h-[400px] overflow-y-auto">
      {props.items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 text-sm transition-colors ${
              index === selectedIndex
                ? "bg-gray-100 text-gray-900"
                : "text-gray-700 hover:bg-gray-50"
            }`}
            type="button"
          >
            {Icon && (
              <div className="shrink-0 size-5 flex items-center justify-center text-gray-600">
                <Icon className="size-4" />
              </div>
            )}
            {!Icon && <div className="shrink-0 size-5" />}
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-medium">{item.label}</span>
              {item.description && (
                <span className="text-xs text-gray-500">{item.description}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});

SlashMenuList.displayName = "SlashMenuList";

export function createSlashMenuSuggestion(
  organizationId: string,
  zero: Zero<Schema>,
  _fileInputRef?: React.RefObject<HTMLInputElement> | React.RefObject<HTMLInputElement | null>,
) {
  return {
    items: async ({ query }: { query: string }) => {
      const filteredItems = slashMenuItems.filter((item) =>
        item.label.toLowerCase().startsWith(query.toLowerCase()),
      );

      // Query components from Zero and add them to the menu
      try {
        const components = await zero.run(
          queries.components.byOrganization({ organizationId }),
        );

        if (components.length > 0) {
          const queryLower = query.toLowerCase();
          const componentItems: SlashMenuItem[] = components
            .filter((component) => component.name.toLowerCase().startsWith(queryLower))
            .map((component) => ({
              id: `component-${component.id}`,
              label: component.name,
              description: "Custom component",
              icon: LayoutRowTwoRegular,
              action: {
                id: `component-${component.id}`,
                label: component.name,
                execute: (editor: Editor) => {
                  // Build schemas for array properties
                  const properties = component.properties as Record<
                    string,
                    { type: string; fields?: Array<{ name: string; type: string }> }
                  >;
                  const schemas: Record<string, { fields: Array<{ name: string; type: string }> }> =
                    {};
                  const types: Record<string, string> = {};
                  const initialProperties: Record<string, unknown> = {};

                  for (const [key, config] of Object.entries(properties)) {
                    types[key] = config.type;
                    if (config.type === "array" && config.fields) {
                      schemas[key] = { fields: config.fields };
                      initialProperties[key] = [];
                    } else if (config.type === "rich_text") {
                      initialProperties[key] = {
                        type: "doc",
                        content: [{ type: "paragraph", content: [] }],
                      };
                    } else if (config.type === "boolean") {
                      initialProperties[key] = false;
                    } else if (config.type === "number") {
                      initialProperties[key] = 0;
                    } else {
                      initialProperties[key] = "";
                    }
                  }

                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: "documentComponent",
                      attrs: {
                        name: component.name,
                        properties: initialProperties,
                        schemas,
                        types,
                      },
                    })
                    .run();
                },
              },
            }));

          return [...filteredItems, ...componentItems];
        }
      } catch (error) {
        console.error("Failed to query components for slash menu:", error);
      }

      return filteredItems;
    },

    render: () => {
      let component: ReactRenderer<
        React.ForwardRefExoticComponent<
          SlashMenuProps &
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
          component = new ReactRenderer(SlashMenuList, {
            props: {
              items: props.items as SlashMenuItem[],
              command: props.command as (item: SlashMenuItem) => void,
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
            items: props.items as SlashMenuItem[],
            command: props.command as (item: SlashMenuItem) => void,
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

export function getSlashCommandAction(
  item: SlashMenuItem,
  editor: Editor,
  range: Range,
  fileInputRef?: React.RefObject<HTMLInputElement> | React.RefObject<HTMLInputElement | null>,
) {
  return () => {
    // Delete the slash character and any query text
    editor.chain().focus().deleteRange(range).run();

    // Execute the formatting action
    item.action.execute(editor);

    // Special case for image - trigger file input
    if (item.id === "image" && fileInputRef?.current) {
      fileInputRef.current.click();
    }
  };
}
