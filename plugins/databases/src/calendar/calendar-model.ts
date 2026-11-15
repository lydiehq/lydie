// Dates for the calendar: month and week grids (weeks start on Monday), day arithmetic on ISO
// dates, and moving or resizing a row's date (keeping any time of day).
import { parseDateValue } from "@lydie/plugin-api/databases";

export type CalendarMode = "month" | "week";

const pad = (n: number) => String(n).padStart(2, "0");

export function iso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function addDays(day: string, n: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + n);
  return iso(date);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

// Monday of the week containing `day`.
export function weekStart(day: string): string {
  const weekday = (parseDay(day).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

// The days a view shows: six full weeks around the month, or one week.
export function gridDays(anchor: string, mode: CalendarMode): string[] {
  const start = mode === "week" ? weekStart(anchor) : weekStart(`${anchor.slice(0, 7)}-01`);
  const count = mode === "week" ? 7 : 42;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function shiftAnchor(anchor: string, mode: CalendarMode, step: number): string {
  if (mode === "week") return addDays(anchor, 7 * step);
  const date = parseDay(`${anchor.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + step);
  return iso(date);
}

export function monthLabel(anchor: string): string {
  return parseDay(anchor).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The days a value covers ([start, end], inclusive), or null for no date.
export function span(value: unknown): { start: string; end: string } | null {
  const parts = parseDateValue(value);
  if (!parts) return null;
  const start = parts.start.slice(0, 10);
  const end = parts.end ? parts.end.slice(0, 10) : start;
  return end < start ? { start, end: start } : { start, end };
}

function withDay(part: string, day: string): string {
  return `${day}${part.slice(10)}`;
}

// The value after dragging: "move" shifts both ends by the days between `from` and `to`; "start"
// and "end" set that end to `to` (an end before the start swaps nothing, it clamps).
export function moveDate(
  value: unknown,
  mode: "move" | "start" | "end",
  from: string,
  to: string,
): string | null {
  const parts = parseDateValue(value);
  if (!parts) return null;
  if (mode === "move") {
    const delta = daysBetween(from, to);
    const start = withDay(parts.start, addDays(parts.start.slice(0, 10), delta));
    if (!parts.end) return start;
    return `${start}/${withDay(parts.end, addDays(parts.end.slice(0, 10), delta))}`;
  }
  const end = parts.end ?? parts.start;
  if (mode === "start") {
    const start = to > end.slice(0, 10) ? end.slice(0, 10) : to;
    const next = withDay(parts.start, start);
    return start === end.slice(0, 10) && !parts.end ? next : `${next}/${end}`;
  }
  const last = to < parts.start.slice(0, 10) ? parts.start.slice(0, 10) : to;
  return `${parts.start}/${withDay(end, last)}`;
}
