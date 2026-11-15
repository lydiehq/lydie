// Focus stays in the editor, which drives this listbox with the caret keys (aria-selected), so
// options have no key handlers of their own and a native <select> would not fit.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events */
import type { SuggestionMenuProps } from "./suggestion-store";

type Props<T> = SuggestionMenuProps<T> & {
  label: (item: T) => string;
  description?: (item: T) => string | undefined;
  emptyLabel?: string;
};

// A plain fallback used when the host passes no renderer. Same markup as v1's SlashMenuList; hosts
// normally render @lydie/ui's CommandList instead.
export function DefaultSuggestionList<T>({
  items,
  selectedIndex,
  onSelect,
  onHighlight,
  label,
  description,
  emptyLabel = "No results",
}: Props<T>) {
  if (items.length === 0) {
    return (
      <div className="min-w-[200px] rounded-lg bg-elevated p-2 shadow-popover">
        <div className="px-2 py-1 text-xs text-gray-500">{emptyLabel}</div>
      </div>
    );
  }
  return (
    <div
      role="listbox"
      className="max-h-[400px] min-w-[280px] overflow-y-auto rounded-lg bg-elevated p-1 shadow-popover"
    >
      {items.map((item, index) => {
        const text = description?.(item);
        return (
          <div
            key={`${index}-${label(item)}`}
            role="option"
            aria-selected={index === selectedIndex}
            tabIndex={-1}
            onClick={() => onSelect(index)}
            onMouseMove={() => onHighlight(index)}
            className={`flex w-full cursor-default flex-col rounded-md px-3 py-2 text-left text-sm ${
              index === selectedIndex ? "bg-gray-100 text-gray-900" : "text-gray-700"
            }`}
          >
            <span className="font-medium">{label(item)}</span>
            {text && <span className="text-xs text-gray-500">{text}</span>}
          </div>
        );
      })}
    </div>
  );
}
