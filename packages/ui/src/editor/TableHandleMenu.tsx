import { Fragment } from "react";
import { MenuTrigger } from "react-aria-components";

import { Button } from "../components/Button";
import { Menu, MenuItem, MenuSeparator } from "../components/Menu";
import {
  AddRegular,
  AlignCenterRegular,
  AlignLeftRegular,
  ArrowLeftRegular,
  ArrowRightRegular,
  ArrowUpRegular,
  CheckRegular,
  CloseRegular,
  Copy2Regular,
  DeleteRegular,
  DotsVerticalRegular,
} from "../icons/mingcute";

// The shape @lydie/editor's table handles hand to their renderer (kept structural, so this
// package does not import the editor).
export type TableHandleMenuAction = {
  id: string;
  label: string;
  icon:
    | "insert-before"
    | "insert-after"
    | "move-before"
    | "move-after"
    | "align-left"
    | "align-center"
    | "align-right"
    | "duplicate"
    | "clear"
    | "delete";
  section: string;
  isDisabled: boolean;
  isSelected?: boolean;
  destructive?: boolean;
  onAction: () => void;
};

type Props = {
  axis: "row" | "column";
  actions: TableHandleMenuAction[];
  onOpenChange: (open: boolean) => void;
};

const iconClass = "size-4 text-gray-500";

function ActionIcon({ icon, axis }: { icon: TableHandleMenuAction["icon"]; axis: Props["axis"] }) {
  switch (icon) {
    case "insert-before":
    case "insert-after":
      return <AddRegular aria-hidden className={iconClass} />;
    // Arrows point where the line goes: up/down for rows, left/right for columns.
    case "move-before":
      return axis === "row" ? (
        <ArrowUpRegular aria-hidden className={iconClass} />
      ) : (
        <ArrowLeftRegular aria-hidden className={iconClass} />
      );
    case "move-after":
      return axis === "row" ? (
        <ArrowUpRegular aria-hidden className={`${iconClass} rotate-180`} />
      ) : (
        <ArrowRightRegular aria-hidden className={iconClass} />
      );
    case "align-left":
      return <AlignLeftRegular aria-hidden className={iconClass} />;
    case "align-center":
      return <AlignCenterRegular aria-hidden className={iconClass} />;
    case "align-right":
      return <AlignLeftRegular aria-hidden className={`${iconClass} -scale-x-100`} />;
    case "duplicate":
      return <Copy2Regular aria-hidden className={iconClass} />;
    case "clear":
      return <CloseRegular aria-hidden className={iconClass} />;
    case "delete":
      return <DeleteRegular aria-hidden className="size-4 text-red-600" />;
  }
}

// The grip on a table's hovered row or column (Tiptap's Table Node, Notion's handles): a small
// pill on the table's edge that opens the line's menu.
export function TableHandleMenu({ axis, actions, onOpenChange }: Props) {
  const sections: TableHandleMenuAction[][] = [];
  for (const action of actions) {
    const last = sections.at(-1);
    if (last && last[0]?.section === action.section) last.push(action);
    else sections.push([action]);
  }
  const label = axis === "row" ? "Row options" : "Column options";
  return (
    <MenuTrigger onOpenChange={onOpenChange}>
      <Button
        variant="secondary"
        size="icon-xs"
        aria-label={label}
        tooltipOptions={{ placement: axis === "row" ? "left" : "top" }}
        className="size-full rounded-[5px] text-gray-400 hover:text-gray-700 pressed:text-gray-900 data-pressed:bg-gray-100"
      >
        {/* MingCute's "dots-vertical" is two columns of three: upright for a row, turned for a column. */}
        <DotsVerticalRegular
          aria-hidden
          className={axis === "row" ? "size-3.5" : "size-3.5 rotate-90"}
        />
      </Button>
      <Menu placement={axis === "row" ? "right top" : "bottom start"}>
        {sections.map((items, index) => (
          <Fragment key={items[0]?.section ?? index}>
            {index > 0 && <MenuSeparator />}
            {items.map((action) => (
              <MenuItem
                key={action.id}
                id={action.id}
                textValue={action.label}
                isDisabled={action.isDisabled}
                onAction={action.onAction}
              >
                <span
                  className={`flex w-full items-center gap-2 ${action.destructive ? "text-red-600" : ""} ${action.isDisabled ? "opacity-40" : ""}`}
                >
                  <ActionIcon icon={action.icon} axis={axis} />
                  <span className="flex-1">{action.label}</span>
                  {action.isSelected && (
                    <CheckRegular aria-hidden className="size-4 text-gray-700" />
                  )}
                </span>
              </MenuItem>
            ))}
          </Fragment>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
