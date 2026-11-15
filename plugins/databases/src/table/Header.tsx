/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-static-element-interactions -- column headers of a virtualised ARIA grid; resizing and reordering are pointer gestures (widths and order are also in the view settings) */
// The sticky header: the select-all checkbox, the title column, the rendered columns and the
// add-property button. Resizing paints widths through CSS variables while the pointer moves and
// saves once on release; dragging a header reorders columns. Shift/Mod+click selects the column.
import { TypeIcon } from "@lydie/plugin-api/databases";
import { useStoreSelector } from "@lydie/plugin-api/grid";
import type { GridStore } from "@lydie/plugin-api/grid";
import {
  AddRegular,
  AriaDialog,
  ArrowUpRegular,
  Button,
  Checkbox,
  DialogTrigger,
  Popover,
} from "@lydie/plugin-api/ui";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useViewContext } from "../context.tsx";
import { AddPropertyForm, PropertyMenu } from "../PropertyMenu.tsx";
import { PopoverButton } from "../ui.tsx";
import type { Column } from "../view-model.ts";
import { LEADING, SELECT_X } from "./TableRow.tsx";

export const HEADER = 34;
export const TRAILING = 48;

type Props = {
  store: GridStore;
  columns: readonly Column[];
  frozen: number;
  frozenLefts: readonly number[];
  spacerFor: (colStart: number) => number;
  allPicked: boolean;
  somePicked: boolean;
  onPickAll: (all: boolean) => void;
  onResizeStart: (col: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onHeaderPointerDown: (col: number, event: ReactPointerEvent<HTMLDivElement>) => void;
};

const colWindow = (s: { viewport: { colStart: number; colEnd: number } }) =>
  s.viewport.colStart * 100_000 + s.viewport.colEnd;

export function HeaderRow({
  store,
  columns,
  frozen,
  frozenLefts,
  spacerFor,
  allPicked,
  somePicked,
  onPickAll,
  onResizeStart,
  onHeaderPointerDown,
}: Props) {
  const packed = useStoreSelector(store, colWindow);
  const colStart = Math.floor(packed / 100_000);
  const colEnd = packed % 100_000;
  const spacer = spacerFor(colStart);
  const cell = (column: Column, col: number) => (
    <HeaderCell
      key={column.property.id}
      column={column}
      col={col}
      left={col < frozen ? (frozenLefts[col] ?? LEADING) : null}
      onResizeStart={onResizeStart}
      onPointerDown={onHeaderPointerDown}
    />
  );
  const cells = [];
  for (let col = 0; col < frozen && col < columns.length; col++)
    cells.push(cell(columns[col]!, col));
  for (let col = Math.max(colStart, frozen); col < colEnd; col++) {
    const column = columns[col];
    if (column) cells.push(cell(column, col));
  }
  return (
    <div
      role="row"
      aria-rowindex={1}
      className="sticky top-0 z-[30] flex bg-surface"
      style={{ height: HEADER, width: "var(--grid-w)" }}
    >
      {/* The page margin, without the header's line: the lines stay as wide as the table. */}
      <div aria-hidden className="shrink-0" style={{ width: "var(--inset)" }} />
      <div
        role="columnheader"
        aria-colindex={1}
        className="sticky left-0 z-[32] shrink-0 border-b border-gray-100 bg-surface"
        style={{ width: LEADING }}
      >
        {/* At the rows' SELECT_X and centred the same way, so the boxes line up. */}
        <Checkbox
          aria-label="Select all pages"
          isSelected={allPicked}
          isIndeterminate={somePicked && !allPicked}
          onChange={onPickAll}
          className="absolute inset-y-0"
          style={{ left: SELECT_X }}
        />
      </div>
      {cells.slice(0, frozen)}
      {spacer > 0 && (
        <div aria-hidden className="shrink-0 border-b border-gray-100" style={{ width: spacer }} />
      )}
      {cells.slice(frozen)}
      <div
        className="flex shrink-0 items-center border-b border-gray-100"
        style={{ width: TRAILING }}
      >
        {/* Below the + even when the type list is taller than the room there (it scrolls):
            flipped above, it covered the page title. */}
        <DialogTrigger>
          <Button variant="ghost" size="icon-sm" aria-label="Add a property">
            <AddRegular aria-hidden />
          </Button>
          <Popover placement="bottom end" shouldFlip={false} className="overflow-auto">
            <AriaDialog aria-label="Add a property" className="outline-none">
              {({ close }) => <AddPropertyForm close={close} />}
            </AriaDialog>
          </Popover>
        </DialogTrigger>
      </div>
    </div>
  );
}

function HeaderCell({
  column,
  col,
  left,
  onResizeStart,
  onPointerDown,
}: {
  column: Column;
  col: number;
  left: number | null;
  onResizeStart: Props["onResizeStart"];
  onPointerDown: Props["onHeaderPointerDown"];
}) {
  const { property } = column;
  const sticky = left !== null;
  // The view's sorts are set in Display (or this column's menu); the arrow shows them here.
  const sort = useViewContext().view.config.sorts.find((s) => s.propertyId === property.id);
  return (
    <div
      role="columnheader"
      aria-colindex={col + 2}
      aria-sort={sort ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
      data-property-id={property.id}
      data-col={col}
      onPointerDownCapture={(event) => onPointerDown(col, event)}
      className={`relative flex shrink-0 items-center border-r border-b border-gray-100 bg-surface text-sm text-gray-600 ${sticky ? "sticky z-[31]" : ""}`}
      style={{ width: `var(--c${col})`, ...(sticky ? { left } : {}) }}
    >
      <PopoverButton
        label={`${property.name} property`}
        button={
          <span className="flex min-w-0 items-center gap-1.5">
            <TypeIcon
              type={property.type}
              aria-hidden
              className="size-3.5 shrink-0 text-gray-400"
            />
            <span className="truncate font-normal">{property.name}</span>
            {sort && (
              <ArrowUpRegular
                aria-hidden
                data-testid="sort-arrow"
                className={`size-3 shrink-0 text-gray-400 ${sort.direction === "desc" ? "rotate-180" : ""}`}
              />
            )}
          </span>
        }
        className="!h-full !w-full !justify-start !rounded-none !px-2"
      >
        {(close) => <PropertyMenu property={property} close={close} />}
      </PopoverButton>
      <div
        aria-hidden
        data-resize-handle=""
        onPointerDown={(event) => onResizeStart(col, event)}
        className="absolute top-0 right-0 z-[5] h-full w-1.5 cursor-col-resize touch-none hover:bg-blue-400"
      />
    </div>
  );
}
