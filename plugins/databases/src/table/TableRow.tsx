/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- virtualised ARIA grid: rows and cells are positioned divs, focus stays on the grid (aria-activedescendant) */
// One table row and its cells. Rows are memoised on their data and on which columns are rendered;
// a cell subscribes to the interaction store only for whether it is selected, so moving the active
// cell re-renders the two cells it leaves and enters (the outline itself is the overlay's).
import { docPath, PageLink, useApp } from "@lydie/plugin-api";
import { PropertyValueView, relatedRows, rowValue } from "@lydie/plugin-api/databases";
import type { ViewRow } from "@lydie/plugin-api/databases";
import { inRect, rectOf, useStoreSelector } from "@lydie/plugin-api/grid";
import type { GridStore, GridStoreState } from "@lydie/plugin-api/grid";
import {
  Button,
  buttonStyles,
  CheckboxMark,
  DotsVerticalRegular,
  LayoutRightRegular,
  Skeleton,
} from "@lydie/plugin-api/ui";
import { memo, useState } from "react";

import { useViewContext } from "../context.tsx";
import { barShare, barWidth } from "../skeleton.tsx";
import type { Column } from "../view-model.ts";

export const LEADING = 40;
// The leading cell: the drag grip, then the selection box. The box's left edge is SELECT_X in the
// rows and in the header (select all), so the boxes line up whatever the grip's glyph measures.
const GRIP_X = 4;
const GRIP = 12;
export const SELECT_X = GRIP_X + GRIP + 2;

export const cellId = (gridId: string, row: number, col: number) => `${gridId}-${row}-${col}`;

const isSelected = (s: GridStoreState, row: number, col: number) =>
  s.selection !== null && inRect(rectOf(s.selection), row, col);

type Props = {
  store: GridStore;
  gridId: string;
  row: ViewRow | undefined;
  // Navigable row index (selection coordinates) and ARIA row index.
  index: number;
  ariaIndex: number;
  columns: readonly Column[];
  // Frozen columns [0, frozen) with their sticky left offsets; scrolling columns [colStart, colEnd)
  // after a spacer for the ones not rendered.
  frozen: number;
  frozenLefts: readonly number[];
  colStart: number;
  colEnd: number;
  spacer: number;
  top: number;
  height: number;
  wrap: boolean;
  draggable: boolean;
  // The page is open in the panel.
  peeked: boolean;
};

export const TableRow = memo(function TableRow({
  store,
  gridId,
  row,
  index,
  ariaIndex,
  columns,
  frozen,
  frozenLefts,
  colStart,
  colEnd,
  spacer,
  top,
  height,
  wrap,
  draggable,
  peeked,
}: Props) {
  const picked = useStoreSelector(store, (s) => (row ? s.rows.ids.has(row.id) : false));
  // The row being dragged fades in place; its ghost follows the pointer (TableView's RowGhost).
  const dragged = useStoreSelector(
    store,
    (s) => s.mode.kind === "rowDragging" && s.mode.row === index,
  );
  const cells = [];
  for (let col = 0; col < frozen; col++) {
    const column = columns[col];
    if (!column) continue;
    cells.push(
      <GridCell
        key={column.property.id}
        store={store}
        gridId={gridId}
        row={row}
        index={index}
        col={col}
        column={column}
        left={frozenLefts[col] ?? LEADING}
        wrap={wrap}
        peeked={peeked}
      />,
    );
  }
  if (spacer > 0)
    cells.push(<div key="spacer" aria-hidden className="shrink-0" style={{ width: spacer }} />);
  for (let col = Math.max(colStart, frozen); col < colEnd; col++) {
    const column = columns[col];
    if (!column) continue;
    cells.push(
      <GridCell
        key={column.property.id}
        store={store}
        gridId={gridId}
        row={row}
        index={index}
        col={col}
        column={column}
        left={null}
        wrap={wrap}
        peeked={peeked}
      />,
    );
  }
  const name = row ? row.title || "Untitled" : null;
  return (
    <div
      role="row"
      aria-rowindex={ariaIndex}
      aria-selected={picked}
      data-row-id={row?.id}
      data-r={index}
      className={`group/row absolute left-0 flex ${picked ? "bg-blue-50" : "bg-surface hover:bg-gray-50"} ${dragged ? "opacity-40" : ""}`}
      style={{ top, height, width: "var(--grid-w)" }}
    >
      <div aria-hidden className="shrink-0" style={{ width: "var(--inset)" }} />
      <div
        role="gridcell"
        aria-colindex={1}
        className="sticky left-0 z-[12] flex shrink-0 items-center border-b border-gray-100 bg-inherit"
        style={{ width: LEADING, paddingLeft: GRIP_X }}
      >
        <span
          data-drag-handle=""
          aria-hidden
          title={draggable ? "Drag to move" : "Remove sorts to reorder by hand"}
          className={`flex shrink-0 cursor-grab touch-none justify-center text-gray-400 select-none opacity-0 group-hover/row:opacity-100 ${row ? "" : "invisible"}`}
          style={{ width: GRIP }}
        >
          <DotsVerticalRegular aria-hidden className="size-3 rotate-90" />
        </span>
        {/* The grid's pointerdown picks rows through data-row-select. Not the Checkbox component:
            rows are recycled while scrolling under a frame budget; CheckboxMark is its look. */}
        <span
          data-row-select=""
          role="checkbox"
          aria-checked={picked}
          aria-label={name ? `Select ${name}` : "Select page"}
          className={`absolute inset-y-0 flex items-center ${picked ? "" : "opacity-0 group-hover/row:opacity-100"}`}
          style={{ left: SELECT_X }}
        >
          <CheckboxMark isSelected={picked} />
        </span>
      </div>
      {cells}
    </div>
  );
});

type CellProps = {
  store: GridStore;
  gridId: string;
  row: ViewRow | undefined;
  index: number;
  col: number;
  column: Column;
  // Sticky left offset for a frozen column, null for a scrolling one.
  left: number | null;
  wrap: boolean;
  peeked: boolean;
};

const GridCell = memo(function GridCell({
  store,
  gridId,
  row,
  index,
  col,
  column,
  left,
  wrap,
  peeked,
}: CellProps) {
  const selected = useStoreSelector(store, (s) => isSelected(s, index, col));
  const { property } = column;
  const frozen = left !== null;
  // The "Open" button is mounted only under the pointer: a Button on every row costs frames while
  // rows are recycled.
  const [hovered, setHovered] = useState(false);
  const hover =
    property.type === "title"
      ? { onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false) }
      : null;
  return (
    <div
      {...hover}
      id={cellId(gridId, index, col)}
      role="gridcell"
      aria-colindex={col + 2}
      aria-selected={selected}
      data-cell=""
      data-c={col}
      className={`relative flex shrink-0 items-center overflow-hidden border-r border-b border-gray-100 px-2 text-sm ${
        frozen ? "sticky z-[10] gap-1 bg-inherit font-medium" : ""
      }`}
      style={{ width: `var(--c${col})`, ...(frozen ? { left } : {}) }}
    >
      {!row ? (
        <Skeleton
          className={`h-3 ${property.type === "title" ? barWidth(index) : barShare(index + col)}`}
        />
      ) : property.type === "title" ? (
        <TitleContent row={row} wrap={wrap} hovered={hovered} peeked={peeked} />
      ) : (
        <PropertyValueView
          property={property}
          value={rowValue(property, row)}
          related={relatedRows(property, row)}
          wrap={wrap}
        />
      )}
    </div>
  );
});

function TitleContent({
  row,
  wrap,
  hovered,
  peeked,
}: {
  row: ViewRow;
  wrap: boolean;
  hovered: boolean;
  peeked: boolean;
}) {
  const name = row.title || "Untitled";
  return (
    <>
      <span
        data-row-title=""
        className={`min-w-0 text-gray-900 ${wrap ? "break-words whitespace-pre-wrap" : "truncate"}`}
      >
        {row.title || <span className="text-gray-400">Untitled</span>}
      </span>
      {(hovered || peeked) && (
        <span className="ml-auto flex shrink-0 gap-0.5">
          <OpenButton id={row.id} name={name} peeked={peeked} />
        </span>
      )}
    </>
  );
}

// Mounted only on the hovered row and the open one, so it can be the real Button and read the
// view's context. On the open one it closes the panel. Otherwise it is a link to the page: a plain
// click opens it to the side, a modified one as any link (`linkMode`).
function OpenButton({ id, name, peeked }: { id: string; name: string; peeked: boolean }) {
  const app = useApp();
  const { peekRow, closePeek } = useViewContext();
  if (!peeked) {
    return (
      <PageLink
        path={docPath(id)}
        title={name}
        tabIndex={-1}
        aria-label={`Open ${name} to the side`}
        onOpen={(mode) => (mode === "replace" ? peekRow(id) : app.openDoc(id, { mode }))}
        className={buttonStyles({ variant: "secondary", size: "xs" })}
      >
        Open
      </PageLink>
    );
  }
  return (
    <Button
      variant="secondary"
      size="xs"
      excludeFromTabOrder
      aria-label={peeked ? `Close ${name}` : `Open ${name} to the side`}
      onPress={() => (peeked ? closePeek() : peekRow(id))}
    >
      {peeked && <LayoutRightRegular aria-hidden />}
      {peeked ? "Close" : "Open"}
    </Button>
  );
}
