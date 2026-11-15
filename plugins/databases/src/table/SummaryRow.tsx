// Per-column summaries in a footer that sticks to the bottom while the body is taller than the
// viewport. Values are over every page of the view, read in pages when any summary is set.
import { useBackend } from "@lydie/plugin-api";
import { useDatabaseView } from "@lydie/plugin-api/databases";
import type { ViewRow } from "@lydie/plugin-api/databases";
import { useStoreSelector } from "@lydie/plugin-api/grid";
import type { GridStore } from "@lydie/plugin-api/grid";
import { DownRegular } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { useViewContext } from "../context.tsx";
import { MenuButtonItem, PopoverButton } from "../ui.tsx";
import { summariesFor, summarize, SUMMARY_LABELS } from "../view-model.ts";
import type { Column, SummaryName } from "../view-model.ts";
import { HEADER } from "./Header.tsx";
import { LEADING } from "./TableRow.tsx";

export const FOOTER = HEADER;

type Props = {
  store: GridStore;
  columns: readonly Column[];
  frozen: number;
  frozenLefts: readonly number[];
  spacerFor: (colStart: number) => number;
};

export function SummaryRow({ store, columns, frozen, frozenLefts, spacerFor }: Props) {
  const { view, updateView, params } = useViewContext();
  const backend = useBackend();
  const colStart = useStoreSelector(store, (s) => s.viewport.colStart);
  const colEnd = useStoreSelector(store, (s) => s.viewport.colEnd);
  const summaries = view.config.summaries;
  const active = Object.keys(summaries).length > 0;
  const [rows, setRows] = useState<readonly ViewRow[] | null>(null);
  // Re-read when the view's rows change (any emission of its first window).
  const probe = useDatabaseView(active ? { ...params, window: { offset: 0, limit: 1 } } : null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const timer = setTimeout(async () => {
      const out: ViewRow[] = [];
      const seen = new Set<string>();
      for (let offset = 0; offset < Math.max(probe.total, 1); offset += 1000) {
        const page = await backend.query("database.view", {
          ...params,
          view: {
            ...params.view,
            config: { ...params.view?.config, groupBy: null, subGroupBy: null },
          },
          window: { offset, limit: 1000 },
        });
        for (const item of page) {
          if (item.kind === "row" && !seen.has(item.row.id)) {
            seen.add(item.row.id);
            out.push(item.row);
          }
        }
      }
      if (!stopped) setRows(out);
    }, 150);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, backend, params, probe]);

  const cell = (column: Column, col: number) => {
    const name = summaries[column.property.id];
    const sticky = col < frozen;
    return (
      <div
        key={column.property.id}
        className={`group/sum flex shrink-0 items-center justify-end border-t border-gray-100 bg-surface text-xs text-gray-500 ${sticky ? "sticky z-[31]" : ""}`}
        style={{
          width: `var(--c${col})`,
          ...(sticky ? { left: frozenLefts[col] ?? LEADING } : {}),
        }}
      >
        <PopoverButton
          label={`Summary of ${column.property.name}`}
          button={
            name ? (
              <span>
                <span className="text-gray-400">{SUMMARY_LABELS[name as SummaryName] ?? name}</span>{" "}
                <span
                  className="font-medium text-gray-700"
                  data-testid={`summary-${column.property.name}`}
                >
                  {rows ? summarize(name, column.property, rows) : "…"}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1 opacity-0 group-hover/sum:opacity-100">
                Summary
                <DownRegular aria-hidden className="size-3.5" />
              </span>
            )
          }
          placement="top start"
          className="!font-normal"
        >
          {(close) => (
            <div className="flex w-48 flex-col p-1">
              <MenuButtonItem
                selected={!name}
                onPress={() => {
                  close();
                  const next = { ...summaries };
                  delete next[column.property.id];
                  updateView({ summaries: next }, { label: "Summary" });
                }}
              >
                None
              </MenuButtonItem>
              {summariesFor(column.property).map((s) => (
                <MenuButtonItem
                  key={s}
                  selected={name === s}
                  onPress={() => {
                    close();
                    updateView(
                      { summaries: { ...summaries, [column.property.id]: s } },
                      { label: "Summary" },
                    );
                  }}
                >
                  {SUMMARY_LABELS[s]}
                </MenuButtonItem>
              ))}
            </div>
          )}
        </PopoverButton>
      </div>
    );
  };
  const cells = [];
  for (let col = 0; col < frozen && col < columns.length; col++)
    cells.push(cell(columns[col]!, col));
  const spacer = spacerFor(colStart);
  for (let col = Math.max(colStart, frozen); col < colEnd; col++) {
    const column = columns[col];
    if (column) cells.push(cell(column, col));
  }
  return (
    <div
      className="sticky bottom-0 z-[30] flex bg-surface"
      style={{ height: FOOTER, width: "var(--grid-w)" }}
    >
      <div aria-hidden className="shrink-0" style={{ width: "var(--inset)" }} />
      <div
        className="sticky left-0 z-[32] shrink-0 border-t border-gray-100 bg-surface"
        style={{ width: LEADING }}
      />
      {cells.slice(0, frozen)}
      {spacer > 0 && (
        <div aria-hidden className="shrink-0 border-t border-gray-100" style={{ width: spacer }} />
      )}
      {cells.slice(frozen)}
    </div>
  );
}
