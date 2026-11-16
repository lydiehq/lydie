/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- columns are labelled groups and drop targets; cards open through their buttons */
// The board: one column per group (select, status, person, relation, …), optionally sub-grouped
// (rows of columns) by a second property. Each column loads its own window and grows as it scrolls. Cards drag between
// columns (setting the grouped value) and within one (manual order); drops paint at once.
import { docPath, PageLink, useApp } from "@lydie/plugin-api";
import type { OpenMode } from "@lydie/plugin-api";
import { groupable, OPTION_COLORS, optionFor, useDatabaseView } from "@lydie/plugin-api/databases";
import type { DatabaseProperty, GroupKey, ViewGroup, ViewRow } from "@lydie/plugin-api/databases";
import {
  AddRegular,
  BoardIllustration,
  Button,
  DotsVerticalRegular,
  EmptyState,
  Select,
  SelectItem,
} from "@lydie/plugin-api/ui";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";

import { Card } from "../Card.tsx";
import { useViewContext } from "../context.tsx";
import {
  BOARD_CARD,
  BOARD_COLUMN,
  BOARD_COLUMN_BG,
  BOARD_FOOTER,
  BOARD_GAP,
  BOARD_HEADER,
  BOARD_LANE,
  BOARD_LIST,
  BOARD_LIST_TOP,
  BOARD_SCROLL,
  BoardSkeleton,
  CardSkeleton,
} from "../skeleton.tsx";
import { groupLabel, visibleColumns } from "../view-model.ts";
import { cardLayout, cardRange, firstAbove, spacers } from "./board-layout.ts";

const CARD_MIME = "application/x-lydie-db-card";
const PAGE = 50;
// A card's height until it has been measured (a title and a line or two), without its cover.
const CARD_ESTIMATE = 72;
// The list renders the cards within this much of its viewport, and its scroll position is kept
// in steps of this much, so scrolling within one renders nothing.
const BAND = 400;

// Heights of the cards measured since the last time (a card that left the list measures nothing).
function measured(entries: readonly ResizeObserverEntry[], observer: ResizeObserver) {
  const out: [string, number][] = [];
  for (const entry of entries) {
    const el = entry.target as HTMLElement;
    const id = el.dataset.card;
    if (!el.isConnected || !id) {
      observer.unobserve(el);
      continue;
    }
    out.push([id, entry.borderBoxSize[0]?.blockSize ?? el.offsetHeight]);
  }
  return out;
}

function withHeights(
  heights: ReadonlyMap<string, number>,
  sizes: readonly [string, number][],
): ReadonlyMap<string, number> {
  let next: Map<string, number> | null = null;
  for (const [id, height] of sizes) {
    if (heights.get(id) === height) continue;
    next ??= new Map(heights);
    next.set(id, height);
  }
  return next ?? heights;
}

type Pending = { row: ViewRow; key: GroupKey; sub: GroupKey; beforeId: string | null };

export function BoardView({ maxHeight }: { maxHeight?: number | undefined }) {
  const { definition, view, params, updateView } = useViewContext();
  const groupBy = view.config.groupBy;
  const shape = useDatabaseView(groupBy ? { ...params, window: { offset: 0, limit: 0 } } : null);
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(new Map());
  const groupProperty = definition.properties.find((p) => p.id === groupBy?.propertyId);
  const subProperty = definition.properties.find(
    (p) => p.id === view.config.subGroupBy?.propertyId,
  );
  // A card leaves out what its column and lane already say.
  const columns = useMemo(() => {
    const grouped = [view.config.groupBy?.propertyId, view.config.subGroupBy?.propertyId];
    return visibleColumns(definition, view).filter((c) => !grouped.includes(c.property.id));
  }, [definition, view]);

  if (!groupBy || !groupProperty) {
    const candidates = definition.properties.filter(
      (p) => groupable(p.type) && p.type !== "title" && p.type !== "formula",
    );
    return (
      <EmptyState
        title="Choose how to group the board"
        illustration={<BoardIllustration />}
        description="Columns come from a select, status, person, relation or other property."
        action={
          <Select
            aria-label="Columns by"
            placeholder="Columns by…"
            className="w-48"
            onSelectionChange={(key) =>
              key !== null &&
              updateView(
                { groupBy: { propertyId: String(key), direction: "asc" } },
                { label: "Group board" },
              )
            }
          >
            {candidates.map((p) => (
              <SelectItem key={p.id} id={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </Select>
        }
      />
    );
  }
  if (shape.isLoading) return <BoardSkeleton />;

  const lanes: GroupKey[] = [];
  const keys: GroupKey[] = [];
  const counts = new Map<string, number>();
  for (const g of shape.groups) {
    if (!lanes.includes(g.subKey)) lanes.push(g.subKey);
    if (!keys.includes(g.key)) keys.push(g.key);
    counts.set(JSON.stringify([g.subKey, g.key]), g.count);
  }
  const laneTotal = (sub: GroupKey) =>
    shape.groups.filter((g) => g.subKey === sub).reduce((n, g) => n + g.count, 0);

  return (
    <div
      className={`min-h-0 grow overflow-auto ${BOARD_SCROLL}`}
      style={maxHeight ? { maxHeight } : undefined}
      data-testid="board-view"
    >
      {lanes.map((sub) => (
        <section
          key={JSON.stringify(sub)}
          aria-label={subProperty ? groupLabel(sub, subProperty) : "Board"}
          // As wide as its columns, so the scroller's right padding follows the last one.
          className="mb-6 w-max min-w-full last:mb-0"
        >
          {subProperty && (
            <h3 className="mb-1.5 flex h-7 items-center gap-2 px-2 text-sm font-medium text-gray-800">
              {groupLabel(sub, subProperty)}
              <span className="text-xs font-normal text-gray-400 tabular-nums">
                {laneTotal(sub)}
              </span>
            </h3>
          )}
          <div className={BOARD_LANE}>
            {keys.map((key) => {
              const count = counts.get(JSON.stringify([sub, key]));
              if (count === undefined) return null;
              return (
                <BoardColumn
                  key={JSON.stringify(key)}
                  groupKey={key}
                  subKey={subProperty ? sub : undefined}
                  count={count}
                  property={groupProperty}
                  columns={columns}
                  pending={pending}
                  onMoved={(rowId, p) =>
                    setPending((m) => {
                      const next = new Map(m);
                      if (p) next.set(rowId, p);
                      else next.delete(rowId);
                      return next;
                    })
                  }
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function BoardColumn({
  groupKey,
  subKey,
  count,
  property,
  columns,
  pending,
  onMoved,
}: {
  groupKey: GroupKey;
  subKey: GroupKey | undefined;
  count: number;
  property: DatabaseProperty;
  columns: ReturnType<typeof visibleColumns>;
  pending: ReadonlyMap<string, Pending>;
  onMoved: (rowId: string, pending: Pending | null) => void;
}) {
  const ctx = useViewContext();
  const { view, params } = ctx;
  const app = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // The card being dragged from this column, faded in its place.
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => {
    if (!dragging) return;
    // A card dropped in another column has left this one before its dragend fires, so that
    // never arrives here: any drop ends the drag too.
    const end = () => setDragging(null);
    window.addEventListener("drop", end, true);
    return () => window.removeEventListener("drop", end, true);
  }, [dragging]);
  const list = useRef<HTMLDivElement>(null);
  // Only the cards near the list's viewport are rendered (a column can hold 1,000): measured as
  // they render, so the rest are placed by their heights, or an estimate before they have been.
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [observer] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries, self) => {
          const sizes = measured(entries, self);
          if (sizes.length) setHeights((current) => withHeights(current, sizes));
        }),
  );
  useEffect(() => () => observer?.disconnect(), [observer]);
  useLayoutEffect(() => {
    if (!observer) return;
    for (const card of list.current?.querySelectorAll<HTMLElement>("[data-card]") ?? [])
      observer.observe(card);
  });
  const [viewport, setViewport] = useState(() => ({ band: 0, height: window.innerHeight }));
  const win = useDatabaseView({
    ...params,
    window: {
      offset: 0,
      limit,
      group: groupKey,
      ...(subKey !== undefined ? { subGroup: subKey } : {}),
    },
  });
  // Moved cards paint in their new column before the write lands.
  const rows = useMemo(() => {
    const out = win.rows.filter((r) => {
      const p = pending.get(r.id);
      return !p || (p.key === groupKey && (subKey === undefined || p.sub === subKey));
    });
    for (const [id, p] of pending) {
      if (p.key !== groupKey || (subKey !== undefined && p.sub !== subKey)) continue;
      if (out.some((r) => r.id === id)) continue;
      const at = p.beforeId ? out.findIndex((r) => r.id === p.beforeId) : -1;
      out.splice(at === -1 ? out.length : at, 0, p.row);
    }
    return out;
  }, [win.rows, pending, groupKey, subKey]);
  const option = groupKey !== null ? optionFor(property, groupKey) : null;
  // Darker while a card is dragged over it.
  const tint =
    view.config.layout.colorColumns && option
      ? OPTION_COLORS[option.color]
      : `${BOARD_COLUMN_BG} data-drop-target:bg-gray-950/[0.06]`;
  const coverHeight = view.config.layout.cover ? 120 : 0;
  const manual = view.config.sorts.length === 0;
  const layout = useMemo(
    () =>
      cardLayout(
        rows.map((r) => r.id),
        heights,
        CARD_ESTIMATE + coverHeight,
        BOARD_GAP,
      ),
    [rows, heights, coverHeight],
  );
  const scrolled = viewport.band * BAND;
  const { start, end } = cardRange(
    layout.tops,
    scrolled - BAND,
    scrolled + viewport.height + 2 * BAND,
  );
  const room = spacers(layout.tops, start, end, BOARD_GAP);

  // From the cards' places, not their boxes: one rect per dragover, not one per card.
  const indexAt = (event: DragEvent) => {
    const el = list.current;
    if (!el) return rows.length;
    const y = event.clientY - el.getBoundingClientRect().top + el.scrollTop - BOARD_LIST_TOP;
    return firstAbove(layout.mids, y);
  };

  const onDrop = (event: DragEvent) => {
    const raw = event.dataTransfer.getData(CARD_MIME);
    const at = dropAt ?? rows.length;
    setDropAt(null);
    if (!raw) return;
    event.preventDefault();
    const moving = JSON.parse(raw) as { row: ViewRow; key: GroupKey; sub: GroupKey | null };
    const others = rows.filter((r) => r.id !== moving.row.id);
    const before = others[at] ?? null;
    const after = at > 0 ? (others[at - 1] ?? null) : null;
    const sameGroup = moving.key === groupKey && (subKey === undefined || moving.sub === subKey);
    if (sameGroup && !manual) return;
    onMoved(moving.row.id, {
      row: moving.row,
      key: groupKey,
      sub: subKey ?? null,
      beforeId: before?.id ?? null,
    });
    // Through the view context: a personal grouping sets the value of the grouping shown.
    void ctx
      .moveRow(
        {
          row: moving.row,
          ...(manual && before
            ? { beforeId: before.id }
            : manual && after
              ? { afterId: after.id }
              : {}),
          ...(!sameGroup ? { group: groupKey, fromGroup: moving.key } : {}),
          ...(subKey !== undefined && moving.sub !== subKey
            ? { subGroup: subKey, fromSubGroup: moving.sub }
            : {}),
        },
        { label: "Move card" },
      )
      .catch((error: unknown) =>
        app.notify({
          title: "Could not move the card",
          description: error instanceof Error ? error.message : String(error),
          kind: "error",
        }),
      )
      .finally(() =>
        requestAnimationFrame(() => requestAnimationFrame(() => onMoved(moving.row.id, null))),
      );
  };

  // A card is a link to its page: a plain click opens it to the side, a modified one as any link.
  const openCard = (row: ViewRow, mode: OpenMode) =>
    mode === "replace" ? ctx.peekRow(row.id) : app.openDoc(row.id, { mode });
  const create = () =>
    void ctx
      .createRow({ group: groupKey, ...(subKey !== undefined ? { subGroup: subKey } : {}) })
      .then((id) => ctx.peekRow(id));
  const label = groupLabel(groupKey, property);
  // The drop line sits in the gap above (or, at the end, below) a card, drawn over it so the
  // cards do not move while dragging. Each card's wrapper has 4px of room around the card.
  const line = "pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-blue-500";

  return (
    <div
      role="group"
      aria-label={`${label} column`}
      data-group={JSON.stringify(groupKey)}
      data-drop-target={dropAt !== null || undefined}
      className={`group/column ${BOARD_COLUMN} ${tint} transition-[background-color] duration-150`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CARD_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const i = indexAt(event);
        setDropAt((d) => (d === i ? d : i));
      }}
      onDragLeave={(event) => {
        // By position: leaving one card for the next also fires here, and `relatedTarget` (where
        // the pointer went) is null in Safari, which would clear the line between cards.
        const box = event.currentTarget.getBoundingClientRect();
        const { clientX: x, clientY: y } = event;
        if (x <= box.left || x >= box.right || y <= box.top || y >= box.bottom) setDropAt(null);
      }}
      onDrop={onDrop}
    >
      <div className={BOARD_HEADER}>
        {option ? (
          <span
            className={`min-w-0 truncate rounded px-1.5 text-xs leading-5 font-medium ${OPTION_COLORS[option.color]}`}
          >
            {groupKey}
          </span>
        ) : (
          <span className="min-w-0 truncate text-sm font-medium text-gray-700">{label}</span>
        )}
        <span className="text-xs text-gray-400 tabular-nums" data-testid="column-count">
          {count}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`New in ${label}`}
          onPress={create}
          className="ml-auto text-gray-500 opacity-0 group-hover/column:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <AddRegular aria-hidden />
        </Button>
      </div>
      <div
        ref={list}
        className={`${BOARD_LIST} relative max-h-[70vh] overflow-y-auto`}
        onScroll={(event) => {
          const el = event.currentTarget;
          const band = Math.floor(el.scrollTop / BAND);
          const height = el.clientHeight;
          setViewport((v) => (v.band === band && v.height === height ? v : { band, height }));
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && limit < count)
            setLimit((l) => Math.min(1000, l + PAGE));
        }}
      >
        {/* Spacers keep their height: the list is a flex column with a max height, where an
            empty item would shrink to take up the overflow and the scroll position would jump. */}
        {room.before > 0 && (
          <div aria-hidden className="shrink-0" style={{ height: room.before }} />
        )}
        {rows.slice(start, end).map((row, j) => (
          // Reaches 4px past the card, for the drop line.
          <div key={row.id} className="relative -m-1 p-1">
            {dropAt === start + j && <div className={`${line} top-0`} />}
            <div
              data-card={row.id}
              data-dragging={dragging === row.id || undefined}
              draggable
              onDragStart={(event) => {
                // The drag starts on the card's link; the card is what the pointer holds.
                const box = event.currentTarget.getBoundingClientRect();
                event.dataTransfer.setDragImage(
                  event.currentTarget,
                  event.clientX - box.left,
                  event.clientY - box.top,
                );
                event.dataTransfer.setData(
                  CARD_MIME,
                  JSON.stringify({ row, key: groupKey, sub: subKey ?? null }),
                );
                event.dataTransfer.effectAllowed = "move";
                setDragging(row.id);
              }}
              onDragEnd={() => setDragging(null)}
              className={`group/card relative cursor-pointer ${BOARD_CARD} outline-solid outline-0 outline-offset-2 outline-blue-600 transition-[box-shadow,opacity] duration-150 hover:shadow-sm hover:ring-gray-950/[0.12] has-[:focus-visible]:outline-2 data-dragging:opacity-40`}
            >
              {/* Covers the card under its relation chips and grip, which are positioned and
                  later, so they stay above it. */}
              <PageLink
                path={docPath(row.id)}
                title={row.title}
                onOpen={(mode) => openCard(row, mode)}
                className="absolute inset-0 rounded-[inherit] outline-none"
              >
                <span className="sr-only">Open {row.title || "Untitled"}</span>
              </PageLink>
              <Card row={row} columns={columns} coverHeight={coverHeight} />
              {/* The grip shows that the card can be dragged (the whole card drags); it covers the
                  title's end on hover, like the table rows' grip. */}
              <span
                aria-hidden
                title="Drag to move"
                className="absolute top-1.5 right-1.5 flex size-5 cursor-grab items-center justify-center rounded bg-elevated text-gray-400 opacity-0 shadow-xs ring-1 ring-gray-950/[0.07] transition-opacity group-hover/card:opacity-100 hover:text-gray-700 active:cursor-grabbing pointer-coarse:hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <DotsVerticalRegular aria-hidden className="size-3 rotate-90" />
              </span>
            </div>
            {dropAt === rows.length && start + j === rows.length - 1 && (
              <div className={`${line} bottom-0`} />
            )}
          </div>
        ))}
        {room.after > 0 && <div aria-hidden className="shrink-0" style={{ height: room.after }} />}
        {dropAt !== null && rows.length === 0 && <div className={`${line} top-0`} />}
        {win.isLoading &&
          rows.length === 0 &&
          Array.from({ length: Math.min(count, 3) }, (_, i) => (
            <div key={i} className={BOARD_CARD}>
              <CardSkeleton index={i} coverHeight={coverHeight} />
            </div>
          ))}
        {limit < count && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setLimit((l) => Math.min(1000, l + PAGE))}
            className="font-normal text-gray-600"
          >
            Load more ({count - Math.min(limit, count)})
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onPress={create}
        className={`${BOARD_FOOTER} justify-start gap-1.5 px-2.5 font-normal text-gray-500`}
      >
        <AddRegular aria-hidden data-icon="inline-start" />
        New page
      </Button>
    </div>
  );
}

export type { ViewGroup };
