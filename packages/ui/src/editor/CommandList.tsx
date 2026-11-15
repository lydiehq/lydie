// Focus stays in the editor, which drives this listbox with the caret keys (aria-selected), so
// options have no key handlers of their own and a native <select> would not fit.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events */
import { clsx } from "clsx";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type CommandListItem = {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
};

type Props = {
  items: CommandListItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHighlight?: (index: number) => void;
  emptyLabel?: string;
  "aria-label"?: string;
};

// v1's SlashMenuList, used for the `/` menu and the `[[` link search. Keyboard handling stays with
// the editor (focus never leaves it), so this is a listbox the caret drives.
export function CommandList({
  items,
  selectedIndex,
  onSelect,
  onHighlight,
  emptyLabel = "No results",
  "aria-label": ariaLabel = "Suggestions",
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="min-w-[200px] rounded-lg bg-elevated p-2 shadow-popover">
        <div className="px-2 py-1 text-xs text-gray-500">{emptyLabel}</div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={ariaLabel}
      className="max-h-[400px] min-w-[280px] overflow-y-auto rounded-lg bg-elevated p-1 shadow-popover"
    >
      {items.map((item, index) => {
        const active = index === selectedIndex;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={active}
            tabIndex={-1}
            onClick={() => onSelect(index)}
            onMouseMove={() => onHighlight?.(index)}
            className={clsx(
              "flex w-full cursor-default items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
              active ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50",
            )}
          >
            <div className="flex size-5 shrink-0 items-center justify-center text-gray-600 [&>svg]:size-4">
              {item.icon}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{item.title}</span>
              {item.description && (
                <span className="truncate text-xs text-gray-500">{item.description}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
