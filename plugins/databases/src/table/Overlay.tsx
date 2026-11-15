// The selection drawn as one layer over the cells, positioned from the store's geometry (never by
// measuring cells): the range, the active cell's outline, the fill handle, a fill's target, drop
// lines for row and column drags, and the anchor the cell editor opens from. Parts over frozen
// columns go in a sticky layer so they stay with those columns while the rest scrolls.
import {
  cellBox,
  columnLeft,
  isRange,
  itemTop,
  rangeBoxes,
  rectOf,
  useStoreSelector,
  withColumnWidth,
} from "@lydie/plugin-api/grid";
import type { Box, GridStore, GridStoreState } from "@lydie/plugin-api/grid";
import type { CSSProperties, PointerEvent, ReactNode, RefObject } from "react";

type Props = {
  store: GridStore;
  editorAnchor: RefObject<HTMLDivElement | null>;
  onFillStart: (event: PointerEvent<HTMLDivElement>) => void;
  // Whether the fill handle is offered (an editable cell under the selection).
  canFill: boolean;
  // Rows of the page open in the panel: outlined across every column.
  peekedRows: readonly number[];
};

const select = (s: GridStoreState) => ({
  geometry: s.geometry,
  selection: s.selection,
  mode: s.mode,
});

const sameSlice = (a: ReturnType<typeof select>, b: ReturnType<typeof select>) =>
  a.geometry === b.geometry && a.selection === b.selection && a.mode === b.mode;

const at = (box: Box): CSSProperties => ({
  left: box.x,
  top: box.y,
  width: box.width,
  height: box.height,
});

export function Overlay({ store, editorAnchor, onFillStart, canFill, peekedRows }: Props) {
  const { geometry: base, selection, mode } = useStoreSelector(store, select, sameSlice);
  if (!base) return null;
  const g = mode.kind === "resizing" ? withColumnWidth(base, mode.col, mode.width) : base;
  const frozen: ReactNode[] = [];
  const scrolling: ReactNode[] = [];
  const put = (col: number, node: ReactNode) => (col < g.frozen ? frozen : scrolling).push(node);
  // Boxes over frozen columns are drawn in the sticky layer, which starts after the inset.
  const place = (col: number, box: Box): Box =>
    col < g.frozen ? { ...box, x: box.x - g.inset } : box;

  const lastCol = g.columnWidths.length - 1;
  // The open page's row wears the active cell's ring, across the row. It glides to another row
  // (a transform, so no layout), since the box keeps its key.
  (lastCol >= 0 ? peekedRows : []).forEach((row, index) => {
    const boxes = rangeBoxes(g, { top: row, bottom: row, left: 0, right: lastCol });
    const ring =
      "absolute top-0 border-2 border-blue-500 transition-transform duration-200 ease-out motion-reduce:transition-none";
    const glide = (box: Box): CSSProperties => ({
      left: box.x,
      width: box.width,
      height: box.height,
      transform: `translateY(${box.y}px)`,
    });
    if (boxes.frozen)
      frozen.push(
        <div
          key={`peek:${index}`}
          className={`${ring} ${boxes.scrolling ? "rounded-l-md border-r-0" : "rounded-md"}`}
          style={glide(place(0, boxes.frozen))}
        />,
      );
    if (boxes.scrolling)
      scrolling.push(
        <div
          key={`peek:${index}`}
          className={`${ring} ${boxes.frozen ? "rounded-r-md border-l-0" : "rounded-md"}`}
          style={glide(boxes.scrolling)}
        />,
      );
  });

  if (selection && g.rowToItem.length > 0) {
    const rect = rectOf(selection);
    if (isRange(selection)) {
      const boxes = rangeBoxes(g, rect);
      // Square inside, rounded at the outer corners (a range over both layers is two boxes).
      const range = "absolute border border-blue-500 bg-blue-500/10";
      if (boxes.frozen)
        frozen.push(
          <div
            key="range"
            className={`${range} ${boxes.scrolling ? "rounded-l-md border-r-0" : "rounded-md"}`}
            style={at(place(0, boxes.frozen))}
          />,
        );
      if (boxes.scrolling)
        scrolling.push(
          <div
            key="range"
            className={`${range} ${boxes.frozen ? "rounded-r-md border-l-0" : "rounded-md"}`}
            style={at(boxes.scrolling)}
          />,
        );
    }
    // Not under the editor, which takes the cell's place.
    if (mode.kind !== "editing") {
      const active = place(selection.focus.col, cellBox(g, selection.focus));
      put(
        selection.focus.col,
        <div
          key="active"
          className="absolute rounded-md outline-2 -outline-offset-2 outline-blue-500"
          style={at(active)}
        />,
      );
    }
    if (mode.kind === "editing") {
      const box = place(mode.cell.col, cellBox(g, mode.cell));
      put(
        mode.cell.col,
        <div key="anchor" ref={editorAnchor} className="absolute" style={at(box)} />,
      );
    }
    if ((mode.kind === "idle" || mode.kind === "filling") && canFill) {
      const corner = place(rect.right, cellBox(g, { row: rect.bottom, col: rect.right }));
      put(
        rect.right,
        <div
          key="fill"
          data-fill-handle=""
          aria-hidden
          onPointerDown={onFillStart}
          className="pointer-events-auto absolute size-2 cursor-crosshair touch-none border border-surface bg-blue-500"
          style={{ left: corner.x + corner.width - 5, top: corner.y + corner.height - 5 }}
        />,
      );
    }
  }
  if (mode.kind === "filling" && mode.target) {
    const boxes = rangeBoxes(g, mode.target);
    const dashed = "absolute border border-dashed border-blue-500";
    if (boxes.frozen)
      frozen.push(<div key="target" className={dashed} style={at(place(0, boxes.frozen))} />);
    if (boxes.scrolling)
      scrolling.push(<div key="target" className={dashed} style={at(boxes.scrolling)} />);
  }
  if (mode.kind === "rowDragging" && mode.over && mode.over.item >= 0) {
    const y = itemTop(g, mode.over.item) + (mode.over.edge === "after" ? g.rowHeight : 0) - 1;
    scrolling.push(
      <div key="drop" className="absolute right-0 left-0 h-0.5 bg-blue-500" style={{ top: y }} />,
    );
  }
  if (mode.kind === "columnDragging" && mode.over !== null && mode.over !== mode.col) {
    const x =
      columnLeft(g, mode.over) + (mode.over > mode.col ? (g.columnWidths[mode.over] ?? 0) : 0) - 1;
    put(
      mode.over,
      <div key="drop" className="absolute top-0 bottom-0 w-0.5 bg-blue-500" style={{ left: x }} />,
    );
  }

  return (
    <>
      <div
        aria-hidden
        data-grid-layer="overlay"
        className="pointer-events-none absolute top-0 left-0 z-[5] h-0 w-0 overflow-visible"
      >
        {scrolling}
      </div>
      <div
        aria-hidden
        data-grid-layer="overlay-frozen"
        className="pointer-events-none absolute top-0 left-0 z-[15] h-0 overflow-visible"
        style={{ width: g.totalWidth }}
      >
        {/* Zero height (children overflow), so neither layer is as tall as the body. */}
        <div
          className="sticky left-0 h-0 overflow-visible"
          style={{ marginLeft: g.inset, width: g.leading + g.frozenWidth }}
        >
          {frozen}
        </div>
      </div>
    </>
  );
}
