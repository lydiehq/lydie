import { useRef } from "react";
import type { ReactNode } from "react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  Popover as AriaPopover,
} from "react-aria-components";

import { Separator } from "../layout/Separator";
import { dropdownItemStyles } from "./ListBox";

export type ContextMenuItem =
  | { type: "separator"; id: string }
  | { id: string; label: string; danger?: boolean; disabled?: boolean; shortcut?: ReactNode };

type Props = {
  // Where the menu opens (viewport coordinates); null closes it.
  position: { x: number; y: number } | null;
  items: readonly ContextMenuItem[];
  onAction: (id: string) => void;
  onClose: () => void;
  label?: string;
};

// A menu at a point (right-click, or a keyboard "menu" key with the element's position).
export function ContextMenu({ position, items, onAction, onClose, label = "Actions" }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={anchor}
        aria-hidden
        style={{
          position: "fixed",
          left: position?.x ?? 0,
          top: position?.y ?? 0,
          width: 1,
          height: 1,
          pointerEvents: "none",
        }}
      />
      <AriaPopover
        triggerRef={anchor}
        isOpen={position !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        placement="bottom start"
        offset={2}
        className="min-w-[180px] rounded-lg bg-elevated shadow-popover outline-none"
      >
        <AriaMenu
          aria-label={label}
          autoFocus="first"
          onAction={(key) => {
            onAction(String(key));
            onClose();
          }}
          disabledKeys={items.filter((i) => "label" in i && i.disabled).map((i) => i.id)}
          className="max-h-[inherit] scroll-fade-b overflow-auto p-1 outline-none"
        >
          {items.map((item) =>
            "label" in item ? (
              <AriaMenuItem
                key={item.id}
                id={item.id}
                textValue={item.label}
                className={(state) =>
                  dropdownItemStyles({ ...state, className: item.danger ? "text-red-600" : "" })
                }
              >
                <span className="grow">{item.label}</span>
                {item.shortcut && (
                  <span className="ml-4 text-xs text-gray-400">{item.shortcut}</span>
                )}
              </AriaMenuItem>
            ) : (
              <Separator key={item.id} className="mx-1 my-1" />
            ),
          )}
        </AriaMenu>
      </AriaPopover>
    </>
  );
}
