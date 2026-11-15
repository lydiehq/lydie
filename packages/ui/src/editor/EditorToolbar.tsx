import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Toolbar } from "react-aria-components";

import { Button } from "../components/Button";
import { Separator } from "../layout/Separator";
import type { EditorToolbarItem } from "./types";

type Props = {
  items: EditorToolbarItem[];
  // Right-hand side, e.g. a document menu or a publish button.
  end?: ReactNode;
  className?: string;
};

// The light formatting bar above the document (v1's EditorToolbar), without the editor wiring.
export function EditorToolbar({ items, end, className }: Props) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-1 border-b border-gray-200 p-1",
        className,
      )}
    >
      <Toolbar aria-label="Editor formatting" className="flex items-center gap-1">
        {items.map((item, index) =>
          item === "separator" ? (
            <Separator
              key={`separator-${index}`}
              orientation="vertical"
              className="mx-1 h-6 w-px bg-gray-200"
            />
          ) : (
            <Button
              key={item.id}
              variant="ghost"
              size="icon-md"
              aria-label={item.label}
              tooltipOptions={{ placement: "bottom", hotkeys: item.hotkeys }}
              aria-pressed={item.isActive}
              isDisabled={item.isDisabled}
              onPress={item.onPress}
              className={item.isActive ? "bg-gray-200" : ""}
            >
              <span className="flex size-[15px] items-center justify-center text-gray-700 [&>svg]:size-full">
                {item.icon}
              </span>
            </Button>
          ),
        )}
      </Toolbar>
      {end}
    </div>
  );
}
