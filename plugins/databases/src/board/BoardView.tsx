/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- columns are labelled groups and drop targets; cards open through their buttons */
// The board: one column per group (select, status, person, relation, …), optionally sub-grouped
// (rows of columns) by a second property. Each column loads its own window and grows as it scrolls. Cards drag between
// columns (setting the grouped value) and within one (manual order); drops paint at once.
import { useApp } from "@lydie/plugin-api";
import { groupable, OPTION_COLORS, optionFor, useDatabaseView } from "@lydie/plugin-api/databases";
import type { DatabaseProperty, GroupKey, ViewGroup, ViewRow } from "@lydie/plugin-api/databases";
import {
  AddRegular,
  BoardIllustration,
  Button,
  EmptyState,
  Select,
  SelectItem,
} from "@lydie/plugin-api/ui";
import { useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";

import { Card } from "../Card.tsx";
import { useViewContext } from "../context.tsx";
import { BoardSkeleton, CardSkeleton } from "../skeleton.tsx";
import { groupLabel, visibleColumns } from "../view-model.ts";

const CARD_MIME = "application/x-lydie-db-card";
const PAGE = 50;

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
  const columns = useMemo(() => visibleColumns(definition, view), [definition, view]);

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
      className="min-h-0 grow overflow-auto p-2"
      style={maxHeight ? { maxHeight } : undefined}
      data-testid="board-view"
    >
      {lanes.map((sub) => (
        <section
          key={JSON.stringify(sub)}
          aria-label={subProperty ? groupLabel(sub, subProperty) : "Board"}
          className="mb-4"
        >
          {subProperty && (
            <h3 className="mb-1 flex items-center gap-2 px-1 text-sm font-medium text-gray-800">
              {groupLabel(sub, subProperty)}
              <span className="text-xs font-normal text-gray-500">{laneTotal(sub)}</span>
            </h3>
          )}
          <div className="flex items-start gap-3">
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
  const list = useRef<HTMLDivElement>(null);
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
  const tint =
    view.config.layout.colorColumns && option ? OPTION_COLORS[option.color] : "bg-gray-50";
  const coverHeight = view.config.layout.cover ? 120 : 0;
  const manual = view.config.sorts.length === 0;

  const indexAt = (event: DragEvent) => {
    const cards = [...(list.current?.querySelectorAll<HTMLElement>("[data-card]") ?? [])];
    const i = cards.findIndex((el) => {
      const box = el.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    return i === -1 ? cards.length : i;
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

  const open = (row: ViewRow, event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.button === 1) ctx.openRow(row.id, event);
    else ctx.peekRow(row.id);
  };

  return (
    <div
      role="group"
      aria-label={`${groupLabel(groupKey, property)} column`}
      data-group={JSON.stringify(groupKey)}
      className={`flex w-64 shrink-0 flex-col rounded-lg ${tint} p-1.5`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CARD_MIME)) return;
        event.preventDefault();
        const i = indexAt(event);
        setDropAt((d) => (d === i ? d : i));
      }}
      onDragLeave={(event) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
          setDropAt(null);
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 px-1 pb-1.5 text-sm">
        {option ? (
          <span className={`rounded px-1.5 text-xs leading-5 ${OPTION_COLORS[option.color]}`}>
            {groupKey}
          </span>
        ) : (
          <span className="font-medium text-gray-700">{groupLabel(groupKey, property)}</span>
        )}
        <span className="text-xs text-gray-500" data-testid="column-count">
          {count}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`New in ${groupLabel(groupKey, property)}`}
          onPress={() =>
            void ctx
              .createRow({ group: groupKey, ...(subKey !== undefined ? { subGroup: subKey } : {}) })
              .then((id) => ctx.peekRow(id))
          }
          className="ml-auto text-gray-500"
        >
          <AddRegular aria-hidden />
        </Button>
      </div>
      <div
        ref={list}
        className="flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && limit < count)
            setLimit((l) => Math.min(1000, l + PAGE));
        }}
      >
        {rows.map((row, i) => (
          <div key={row.id}>
            {dropAt === i && <div className="h-0.5 rounded bg-blue-500" />}
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the card's button opens it from the keyboard */}
            <div
              data-card={row.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  CARD_MIME,
                  JSON.stringify({ row, key: groupKey, sub: subKey ?? null }),
                );
                event.dataTransfer.effectAllowed = "move";
              }}
              onClick={(event) => open(row, event)}
              className="cursor-pointer rounded-md bg-surface shadow-sm ring-1 ring-gray-950/5 hover:ring-gray-950/15 [content-visibility:auto]"
            >
              {/* Plain: one per card (columns hold hundreds) and visually hidden, so no look to share. */}
              <button
                type="button"
                className="sr-only"
                onClick={(event) => {
                  event.stopPropagation();
                  open(row, event);
                }}
              >
                Open {row.title || "Untitled"}
              </button>
              <Card row={row} columns={columns} coverHeight={coverHeight} />
            </div>
          </div>
        ))}
        {dropAt !== null && dropAt >= rows.length && <div className="h-0.5 rounded bg-blue-500" />}
        {win.isLoading &&
          rows.length === 0 &&
          Array.from({ length: Math.min(count, 3) }, (_, i) => (
            <div key={i} className="rounded-md bg-surface shadow-sm ring-1 ring-gray-950/5">
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
    </div>
  );
}

export type { ViewGroup };
