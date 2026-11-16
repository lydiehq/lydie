/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- the month grid is an ARIA grid of positioned days; days are reached through their buttons */
// The calendar: month or week, rows placed by a date property. Drag an event to another day to
// move it, drag its edges to change a range, click a day to create a row on it.
import { docPath, PageLink, useApp, useBackend, useOps, useTab } from "@lydie/plugin-api";
import { todayIso, useDatabaseView } from "@lydie/plugin-api/databases";
import type { DatabaseProperty, ViewRow } from "@lydie/plugin-api/databases";
import {
  AddRegular,
  Button,
  EmptyState,
  focusRingInsetClass,
  LeftRegular,
  RightRegular,
  Select,
  SelectItem,
} from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { DragEvent } from "react";

import { useViewContext } from "../context.tsx";
import { addDays, gridDays, monthLabel, moveDate, shiftAnchor, span } from "./calendar-model.ts";
import type { CalendarMode } from "./calendar-model.ts";

const EVENT_MIME = "application/x-lydie-db-event";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Events shown per day in the month grid; the rest are behind "+N more" (the week).
const MONTH_LIMIT = 4;

export function CalendarView(_props: { maxHeight?: number | undefined }) {
  const ctx = useViewContext();
  const { definition, view, params, updateView } = ctx;
  const ops = useOps();
  const app = useApp();
  const backend = useBackend();
  const tab = useTab();
  const layout = view.config.layout;
  const property = (definition.properties.find((p) => p.id === layout.calendarPropertyId) ??
    definition.properties.find((p) => p.type === "date")) as DatabaseProperty | undefined;
  const mode: CalendarMode = layout.calendarMode ?? "month";
  const [anchor, setAnchor] = useState(todayIso());
  const [over, setOver] = useState<string | null>(null);
  const days = gridDays(anchor, mode);
  const showWeekends = layout.showWeekends ?? true;
  const shownDays = showWeekends ? days : days.filter((_, i) => i % 7 < 5);
  const perWeek = showWeekends ? 7 : 5;
  const result = useDatabaseView(
    property
      ? {
          ...params,
          view: {
            ...params.view,
            config: { ...params.view?.config, groupBy: null, subGroupBy: null },
          },
          window: {
            offset: 0,
            limit: 1000,
            range: { propertyId: property.id, start: days[0]!, end: addDays(days.at(-1)!, 1) },
          },
        }
      : null,
  );

  if (!property) {
    return (
      <EmptyState
        title="No date property"
        description="Add a date property to place pages on the calendar."
      />
    );
  }

  const byDay = new Map<string, { row: ViewRow; start: string; end: string }[]>();
  for (const row of result.rows) {
    const s = span(row.properties[property.key]);
    if (!s) continue;
    for (
      let d = s.start < days[0]! ? days[0]! : s.start;
      d <= s.end && d <= days.at(-1)!;
      d = addDays(d, 1)
    ) {
      const list = byDay.get(d) ?? [];
      list.push({ row, ...s });
      byDay.set(d, list);
    }
  }

  const onDrop = (event: DragEvent, day: string) => {
    const raw = event.dataTransfer.getData(EVENT_MIME);
    setOver(null);
    if (!raw) return;
    event.preventDefault();
    const drag = JSON.parse(raw) as {
      id: string;
      mode: "move" | "start" | "end";
      from: string;
      value: string;
    };
    if (drag.from === day) return;
    const next = moveDate(drag.value, drag.mode, drag.from, day);
    if (!next) return;
    const set = { databaseId: ctx.databaseId, rowIds: [drag.id], set: { [property.id]: next } };
    // A range on a property without end dates turns them on, in the same undo step.
    const write =
      next.includes("/") && !property.config.range
        ? backend.transaction(
            "Change date range",
            async (tx) => {
              await tx.database.updateProperty({
                id: property.id,
                config: { ...property.config, range: true },
              });
              await tx.database.setValues(set);
            },
            { scope: tab?.id ?? app.historyScope() },
          )
        : ops.database.setValues(set, {
            label: drag.mode === "move" ? "Move date" : "Change date range",
          });
    void write.catch((error: unknown) =>
      app.notify({
        title: "Could not change the date",
        description: error instanceof Error ? error.message : String(error),
        kind: "error",
      }),
    );
  };

  const startDrag = (
    event: DragEvent,
    row: ViewRow,
    mode: "move" | "start" | "end",
    from: string,
  ) => {
    event.stopPropagation();
    if (mode === "move") {
      // The drag starts on the event's link; the chip is what the pointer holds.
      const box = event.currentTarget.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        event.currentTarget,
        event.clientX - box.left,
        event.clientY - box.top,
      );
    }
    event.dataTransfer.setData(
      EVENT_MIME,
      JSON.stringify({ id: row.id, mode, from, value: row.properties[property.key] }),
    );
    event.dataTransfer.effectAllowed = "move";
  };

  const today = todayIso();
  return (
    <div className="flex min-h-0 grow flex-col" data-testid="calendar-view">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <h3 className="text-sm font-medium text-gray-900" aria-live="polite">
          {mode === "week" ? `Week of ${days[0]}` : monthLabel(anchor)}
        </h3>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous"
            onPress={() => setAnchor(shiftAnchor(anchor, mode, -1))}
          >
            <LeftRegular aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setAnchor(todayIso())}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next"
            onPress={() => setAnchor(shiftAnchor(anchor, mode, 1))}
          >
            <RightRegular aria-hidden />
          </Button>
          <Select
            aria-label="Calendar range"
            variant="ghost"
            selectedKey={mode}
            onSelectionChange={(key) =>
              key !== null &&
              updateView(
                { layout: { ...layout, calendarMode: key as CalendarMode } },
                { label: "Calendar range" },
              )
            }
          >
            <SelectItem id="month">Month</SelectItem>
            <SelectItem id="week">Week</SelectItem>
          </Select>
        </div>
      </div>
      <div
        role="grid"
        aria-label="Calendar"
        className="grid min-h-0 grow overflow-auto border-t border-l border-gray-100"
        style={{ gridTemplateColumns: `repeat(${perWeek}, minmax(0, 1fr))` }}
      >
        {WEEKDAYS.slice(0, perWeek).map((d) => (
          <div
            key={d}
            role="columnheader"
            className="border-r border-b border-gray-100 px-2 py-1 text-xs text-gray-500"
          >
            {d}
          </div>
        ))}
        {shownDays.map((day) => {
          const events = byDay.get(day) ?? [];
          const outside = mode === "month" && day.slice(0, 7) !== anchor.slice(0, 7);
          return (
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the day's "+" button creates from the keyboard
            <div
              key={day}
              role="gridcell"
              aria-label={day}
              data-day={day}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("[data-event]")) return;
                void ctx
                  .createRow({ values: { [property.id]: day } })
                  .then((id) => ctx.peekRow(id));
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(EVENT_MIME)) return;
                event.preventDefault();
                setOver(day);
              }}
              onDragLeave={() => setOver((o) => (o === day ? null : o))}
              onDrop={(event) => onDrop(event, day)}
              className={`group/day flex min-w-0 flex-col gap-0.5 overflow-hidden border-r border-b border-gray-100 p-1 ${mode === "week" ? "min-h-80" : "min-h-24"} ${outside ? "bg-gray-50/70" : ""} ${over === day ? "bg-blue-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs ${day === today ? "rounded-full bg-red-500 px-1.5 text-white" : outside ? "text-gray-400" : "text-gray-600"}`}
                >
                  {Number(day.slice(8))}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`New on ${day}`}
                  onPress={() =>
                    void ctx
                      .createRow({ values: { [property.id]: day } })
                      .then((id) => ctx.peekRow(id))
                  }
                  className="text-gray-400 opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100"
                >
                  <AddRegular aria-hidden />
                </Button>
              </div>
              {events.length > MONTH_LIMIT && mode === "month" && (
                <Button
                  variant="ghost"
                  size="xs"
                  onPress={() => {
                    setAnchor(day);
                    updateView(
                      { layout: { ...layout, calendarMode: "week" } },
                      { label: "Calendar range" },
                    );
                  }}
                  className="order-last justify-start font-normal text-gray-500"
                >
                  +{events.length - MONTH_LIMIT} more
                </Button>
              )}
              {(mode === "month" ? events.slice(0, MONTH_LIMIT) : events).map(
                ({ row, start, end }) => (
                  <div
                    key={row.id}
                    data-event={row.id}
                    draggable
                    onDragStart={(event) => startDrag(event, row, "move", day)}
                    className={`group/event relative flex items-center rounded bg-blue-100 px-1 text-xs text-blue-950 ${start !== end ? (day === start ? "rounded-r-none" : day === end ? "rounded-l-none" : "rounded-none") : ""}`}
                  >
                    {day === start && start !== end && (
                      <span
                        draggable
                        aria-hidden
                        data-edge="start"
                        onDragStart={(event) => startDrag(event, row, "start", day)}
                        className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize"
                      />
                    )}
                    {/* A link to the page: a plain click opens it to the side, a modified one as any
                        link. */}
                    <PageLink
                      path={docPath(row.id)}
                      title={row.title}
                      onClick={(event) => event.stopPropagation()}
                      onOpen={(mode) =>
                        mode === "replace" ? ctx.peekRow(row.id) : app.openDoc(row.id, { mode })
                      }
                      className={`min-w-0 flex-1 truncate rounded text-left ${focusRingInsetClass}`}
                    >
                      {day === start || day === days[0] ? row.title || "Untitled" : " "}
                    </PageLink>
                    {day === end && (
                      <span
                        draggable
                        aria-hidden
                        data-edge="end"
                        onDragStart={(event) => startDrag(event, row, "end", day)}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize"
                      />
                    )}
                  </div>
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
