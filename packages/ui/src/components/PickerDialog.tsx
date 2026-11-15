// The ARIA combobox pattern: focus stays in the input, which drives the listbox through
// aria-activedescendant, so options are neither focusable nor keyboard targets themselves.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */
import clsx from "clsx";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Dialog, Modal as RACModal, ModalOverlay } from "react-aria-components";

import { CloseRegular, RightRegular, Search2Regular } from "../icons/mingcute";
import { overlayStyles } from "./Modal";
import { WithTooltip } from "./Tooltip";

export type PickerItem = {
  id: string;
  title: string;
  subtitle?: ReactNode;
  // Right-aligned hint, e.g. a keybinding.
  hint?: ReactNode;
  // Left of the title, e.g. a page icon. SVG icons are sized to 16 px.
  icon?: ReactNode;
  // Shown before the title as "A › B › title", e.g. a command's group outside its heading.
  breadcrumbs?: readonly string[];
  group?: string;
  disabled?: boolean;
};

export type PickerSelectEvent = {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
};

type Props = {
  label: string;
  placeholder?: string;
  query: string;
  onQueryChange: (query: string) => void;
  items: readonly PickerItem[];
  onSelect: (item: PickerItem, event: PickerSelectEvent) => void;
  onClose: () => void;
  emptyText?: ReactNode;
  footer?: ReactNode;
  isLoading?: boolean;
  // "fixed" keeps the list one height while the results change, so the dialog does not jump as
  // you type (command palette, quick switcher). Default: fit the items.
  height?: "fit" | "fixed";
  // A pill above the input naming what the results act on (e.g. the open document). Backspace in
  // the empty input or its button runs `onRemove`.
  context?: PickerContext | null;
  // The item Enter would choose changed (arrows, pointer, new results): e.g. to fetch it ahead.
  onHighlight?: (item: PickerItem) => void;
  // On a nested page (a command's choices): Escape runs this instead of closing.
  onBack?: (() => void) | undefined;
};

export type PickerContext = { label: string; icon?: ReactNode; onRemove?: () => void };

// A modal search box over a list (command palette, quick switcher): type to filter, arrows to move,
// Enter to choose (Cmd/Ctrl+Enter passes the modifier, e.g. "open in new tab"), Escape to close.
// Implements the ARIA combobox pattern with aria-activedescendant so focus stays in the input.
export function PickerDialog({
  label,
  placeholder,
  query,
  onQueryChange,
  items,
  onSelect,
  onClose,
  emptyText = "No results",
  footer,
  isLoading,
  height = "fit",
  context,
  onHighlight,
  onBack,
}: Props) {
  // The highlight resets when the query or the context changes.
  const resetKey = `${context?.label ?? ""}\0${query}`;
  const [highlight, setHighlight] = useState({ key: resetKey, index: 0 });
  const active = highlight.key === resetKey ? highlight.index : 0;
  const setActive = (next: number | ((i: number) => number)) =>
    setHighlight({ key: resetKey, index: typeof next === "function" ? next(active) : next });
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const index = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  const highlightedId = items[index]?.id;
  useEffect(() => {
    const item = items[index];
    if (item && !item.disabled) onHighlight?.(item);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once per highlighted item
  }, [highlightedId]);

  const choose = (i: number, event: PickerSelectEvent) => {
    const item = items[i];
    if (item && !item.disabled) onSelect(item, event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(index, event);
    } else if (event.key === "Backspace" && query === "" && context?.onRemove) {
      event.preventDefault();
      context.onRemove();
    } else if (event.key === "Escape" && onBack) {
      // Before the modal's own handler, which would close it.
      event.preventDefault();
      event.stopPropagation();
      onBack();
    }
  };

  const headers = items.map((item, i) =>
    item.group && item.group !== items[i - 1]?.group ? item.group : null,
  );
  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className={(state) => clsx(overlayStyles(state), "items-start pt-[12vh]")}
    >
      <RACModal
        className={({ isEntering, isExiting }) =>
          clsx(
            "w-full max-w-[40rem] overflow-hidden rounded-xl bg-elevated text-left shadow-dialog",
            isEntering && "animate-in duration-150 ease-out zoom-in-98",
            isExiting && "animate-out duration-100 ease-in zoom-out-98",
          )
        }
      >
        <Dialog aria-label={label} className="flex max-h-[76vh] flex-col outline-none">
          {context && (
            <div className="flex shrink-0 px-4 pt-3">
              <span
                data-testid="picker-context"
                className="inline-flex h-6 max-w-[20rem] min-w-0 items-center gap-1.5 rounded-md bg-gray-950/5 pr-1 pl-2 text-xs font-medium text-gray-700"
              >
                {context.icon && (
                  <span className="flex size-3.5 shrink-0 items-center justify-center text-gray-500 [&_svg]:size-3.5">
                    {context.icon}
                  </span>
                )}
                <span className="truncate">{context.label}</span>
                {context.onRemove ? (
                  <WithTooltip label={`Remove ${context.label}`}>
                    <button
                      type="button"
                      aria-label={`Remove ${context.label}`}
                      onClick={context.onRemove}
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex size-4 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-950/5 hover:text-gray-700"
                    >
                      <CloseRegular className="size-3" />
                    </button>
                  </WithTooltip>
                ) : (
                  <span className="w-1" />
                )}
              </span>
            </div>
          )}
          <label className="flex h-13 shrink-0 cursor-text items-center gap-2.5 border-b border-gray-950/7 px-5">
            <Search2Regular className="size-4 shrink-0 translate-y-px text-gray-500" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items[index] ? `${listId}-${index}` : undefined}
              aria-label={label}
              placeholder={placeholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              data-1p-ignore
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
          </label>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className={clsx(
              "flex scroll-fade flex-col overflow-y-auto overscroll-contain p-2",
              height === "fixed" ? "h-[38vh] max-h-[29rem] min-h-86" : "min-h-0",
            )}
          >
            {items.length === 0 && (
              <div className="flex h-16 items-center justify-center px-4 text-center text-sm text-gray-500">
                {isLoading ? "Searching…" : emptyText}
              </div>
            )}
            {items.map((item, i) => {
              const header = headers[i];
              const selected = i === index;
              return (
                <div key={item.id}>
                  {header && (
                    <div
                      role="presentation"
                      className={clsx(
                        "flex h-6 items-center px-2 text-xs text-gray-500 select-none",
                        i > 0 && "mt-1.5",
                      )}
                    >
                      {header}
                    </div>
                  )}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={item.disabled || undefined}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onMouseDown={(e: MouseEvent) => e.preventDefault()}
                    onClick={(e) => choose(i, e)}
                    className={clsx(
                      "flex min-h-11 cursor-default items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-[450] select-none",
                      selected && "bg-gray-950/5",
                      item.disabled ? "opacity-50" : "",
                    )}
                  >
                    {item.icon && (
                      <span
                        className={clsx(
                          "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
                          selected ? "text-gray-900" : "text-gray-500",
                        )}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span className="flex min-w-0 grow flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {item.breadcrumbs?.map((crumb, c) => (
                          <Fragment key={`${crumb}-${c}`}>
                            <span
                              className={clsx(
                                "shrink-0",
                                selected ? "text-gray-700" : "text-gray-500",
                              )}
                            >
                              {crumb}
                            </span>
                            <RightRegular className="size-3 shrink-0 text-gray-300" />
                          </Fragment>
                        ))}
                        <span
                          className={clsx("truncate", selected ? "text-gray-950" : "text-gray-700")}
                        >
                          {item.title}
                        </span>
                      </span>
                      {item.subtitle && (
                        <span className="truncate text-xs font-normal text-gray-500">
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                    {item.hint && (
                      <span className="shrink-0 text-xs font-normal text-gray-400">
                        {item.hint}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-gray-950/7 px-5 py-2 text-[11px] text-gray-400">
              {footer}
            </div>
          )}
        </Dialog>
      </RACModal>
    </ModalOverlay>
  );
}
