/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- a virtualised list of positioned rows */
// The list: one line per row (title, then the visible properties), virtualised, with group headers
// when grouped. A row's title is a link to its page.
import { docPath, PageLink } from "@lydie/plugin-api";
import {
  isEmptyValue,
  PropertyValueView,
  relatedRows,
  rowValue,
  useDatabaseView,
} from "@lydie/plugin-api/databases";
import type { ViewRow } from "@lydie/plugin-api/databases";
import { AddRegular, Button, EmptyState, Skeleton } from "@lydie/plugin-api/ui";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useViewContext } from "./context.tsx";
import { barWidth, PLACEHOLDERS } from "./skeleton.tsx";
import { groupLabel, placeholderItems, tableItems, visibleColumns } from "./view-model.ts";
import type { Column } from "./view-model.ts";
import { visibleRange, windowFor } from "./virtual.ts";

const ROW = 36;

export function useVirtualScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ top: 0, height: 600, width: 800 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setState((s) =>
        s.height === el.clientHeight && s.width === el.clientWidth
          ? s
          : { ...s, height: el.clientHeight, width: el.clientWidth },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const frame = useRef<number | null>(null);
  const onScroll = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = ref.current;
      if (el) setState((s) => (s.top === el.scrollTop ? s : { ...s, top: el.scrollTop }));
    });
  };
  return { ref, ...state, onScroll };
}

export function ListView({ maxHeight }: { maxHeight?: number | undefined }) {
  const ctx = useViewContext();
  const { definition, view, params } = ctx;
  const scroll = useVirtualScroll();
  // Until the first result (`pending`) the list draws placeholder lines.
  const [shape, setShape] = useState<{
    total: number;
    groups: ReturnType<typeof useDatabaseView>["groups"];
    pending: boolean;
  }>({
    total: 0,
    groups: [],
    pending: true,
  });
  const grouped = view.config.groupBy !== null;
  const groupProperty = definition.properties.find((p) => p.id === view.config.groupBy?.propertyId);
  const items = useMemo(
    () =>
      shape.pending
        ? placeholderItems(PLACEHOLDERS)
        : tableItems(shape.total, shape.groups, grouped, view.config.groupBy?.collapsed ?? []),
    [shape, grouped, view.config.groupBy?.collapsed],
  );
  const columns = useMemo(() => visibleColumns(definition, view), [definition, view]);
  const range = visibleRange(scroll.top, scroll.height, ROW, items.length);
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  for (let i = range.start; i < range.end; i++) {
    const item = items[i];
    if (item?.kind === "row") {
      first = Math.min(first, item.position);
      last = Math.max(last, item.position + 1);
    }
  }
  if (first === Number.POSITIVE_INFINITY) first = 0;
  const result = useDatabaseView({
    ...params,
    window: windowFor(first, last, shape.total || undefined),
  });
  useLayoutEffect(() => {
    if (result.isLoading) return;
    setShape((s) =>
      !s.pending && s.total === result.total && s.groups === result.groups
        ? s
        : { total: result.total, groups: result.groups, pending: false },
    );
  }, [result]);
  const markers = view.config.layout.markers ?? "none";

  return (
    <div
      ref={scroll.ref}
      onScroll={scroll.onScroll}
      role="list"
      aria-label="Pages"
      aria-busy={shape.pending}
      className="relative min-h-0 grow overflow-auto"
      style={maxHeight ? { maxHeight } : undefined}
      data-testid="list-view"
    >
      <div className="relative" style={{ height: items.length * ROW }}>
        {items.slice(range.start, range.end).map((item, i) => {
          const top = (range.start + i) * ROW;
          if (item.kind === "group") {
            return (
              <div
                key={`g:${JSON.stringify(item.group.key)}`}
                role="presentation"
                className="absolute inset-x-0 flex items-end px-3 pb-1 text-sm font-medium text-gray-800"
                style={{ top, height: ROW }}
              >
                {groupLabel(item.group.key, groupProperty)}
                <span className="ml-2 text-xs font-normal text-gray-500">{item.group.count}</span>
              </div>
            );
          }
          if (item.kind === "add") {
            return (
              <div
                key={`a:${JSON.stringify(item.group ?? "all")}`}
                className="absolute inset-x-0 flex items-center px-3"
                style={{ top, height: ROW }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    void ctx
                      .createRow(item.group === undefined ? {} : { group: item.group })
                      .then((id) => ctx.peekRow(id))
                  }
                  className="font-normal text-gray-500"
                >
                  <AddRegular aria-hidden data-icon="inline-start" />
                  New
                </Button>
              </div>
            );
          }
          const row = result.rows[item.position - result.offset];
          return (
            <ListRow
              key={row ? `${row.id}:${JSON.stringify(item.group)}` : `p:${item.position}`}
              row={row}
              index={item.position}
              marker={markers}
              columns={columns}
              top={top}
            />
          );
        })}
      </div>
      {!shape.pending && shape.total === 0 && !grouped && (
        <div className="pointer-events-none absolute inset-x-0 top-10">
          <EmptyState title="No pages" />
        </div>
      )}
    </div>
  );
}

const ListRow = memo(function ListRow({
  row,
  index,
  marker,
  columns,
  top,
}: {
  row: ViewRow | undefined;
  index: number;
  marker: string;
  columns: readonly Column[];
  top: number;
}) {
  return (
    <div
      role="listitem"
      className="absolute inset-x-0 flex items-center gap-3 border-b border-gray-100 px-3 hover:bg-gray-50"
      style={{ top, height: ROW }}
    >
      {marker !== "none" && (
        <span className="w-6 text-right text-xs text-gray-400">
          {marker === "number" ? `${index + 1}.` : "•"}
        </span>
      )}
      {row ? (
        <>
          <PageLink
            path={docPath(row.id)}
            title={row.title}
            className="min-w-0 truncate text-sm font-medium text-gray-900 hover:underline"
          >
            {row.title || "Untitled"}
          </PageLink>
          <span className="ml-auto flex min-w-0 items-center gap-3 overflow-hidden">
            {columns.slice(1).map((c) => {
              const value = rowValue(c.property, row);
              if (isEmptyValue(value)) return null;
              return (
                <span
                  key={c.property.id}
                  className="flex max-w-48 min-w-0 shrink-0 text-xs text-gray-600"
                  title={c.property.name}
                >
                  <PropertyValueView
                    property={c.property}
                    value={value}
                    related={relatedRows(c.property, row)}
                  />
                </span>
              );
            })}
          </span>
        </>
      ) : (
        <>
          <Skeleton className={`h-3 ${barWidth(index)}`} />
          <Skeleton className={`ml-auto h-2.5 ${index % 2 ? "w-16" : "w-24"}`} />
        </>
      )}
    </div>
  );
});
