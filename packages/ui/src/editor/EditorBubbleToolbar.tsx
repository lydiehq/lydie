import { clsx } from "clsx";
import { Fragment } from "react";
import type { ReactNode } from "react";

import { Button } from "../components/Button";
import { Separator } from "../layout/Separator";
import { BlockTypeSelect } from "./BlockTypeSelect";
import type { BlockTypeOption, EditorToolbarItem } from "./types";

type Props = {
  items: EditorToolbarItem[];
  blockTypes?: BlockTypeOption[];
  activeBlockType?: string;
  onBlockTypeChange?: (id: string) => void;
  // Replaces the buttons, e.g. with an inline link field.
  children?: ReactNode;
  className?: string;
};

// v1's dark selection toolbar (components/editor/BubbleMenu.tsx), without the editor wiring.
export function EditorBubbleToolbar({
  items,
  blockTypes,
  activeBlockType,
  onBlockTypeChange,
  children,
  className,
}: Props) {
  return (
    <div
      className={clsx(
        "dark flex items-center gap-1 rounded-[10px] border border-white/20 bg-black/95 p-1 shadow-popover",
        className,
      )}
    >
      {children ?? (
        <>
          {blockTypes && onBlockTypeChange && (
            <>
              <BlockTypeSelect
                options={blockTypes}
                value={activeBlockType ?? blockTypes[0]?.id ?? ""}
                onChange={onBlockTypeChange}
              />
              <Separator orientation="vertical" className="h-4" />
            </>
          )}
          {items.map((item, index) =>
            item === "separator" ? (
              <Separator key={`separator-${index}`} orientation="vertical" className="h-4" />
            ) : (
              <Button
                key={item.id}
                onPress={item.onPress}
                variant="ghost"
                size="icon-sm"
                aria-label={item.label}
                tooltipOptions={{ placement: "bottom", hotkeys: item.hotkeys }}
                aria-pressed={item.isActive}
                isDisabled={item.isDisabled}
                className={item.isActive ? "bg-white/30" : ""}
              >
                <span className="flex size-[15px] items-center justify-center [&>svg]:size-full">
                  {item.icon}
                </span>
              </Button>
            ),
          )}
        </>
      )}
    </div>
  );
}
