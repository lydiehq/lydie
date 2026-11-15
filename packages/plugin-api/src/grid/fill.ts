// The fill handle: which cells a drag fills, and the values they get. One value is copied; two or
// more numbers (or dates) with a constant step continue as a series; anything else repeats. Also
// the ranges of fill down / fill right (Mod+D / Mod+R), which always copy one value.
import type { Cell, Rect } from "./selection.ts";

// The cells a fill drag covers: from the source along the axis the pointer left it furthest on.
export function fillTarget(source: Rect, cell: Cell): Rect | null {
  const dy =
    cell.row > source.bottom
      ? cell.row - source.bottom
      : cell.row < source.top
        ? cell.row - source.top
        : 0;
  const dx =
    cell.col > source.right
      ? cell.col - source.right
      : cell.col < source.left
        ? cell.col - source.left
        : 0;
  if (dy === 0 && dx === 0) return null;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0
      ? { top: source.bottom + 1, bottom: cell.row, left: source.left, right: source.right }
      : { top: cell.row, bottom: source.top - 1, left: source.left, right: source.right };
  }
  return dx > 0
    ? { top: source.top, bottom: source.bottom, left: source.right + 1, right: cell.col }
    : { top: source.top, bottom: source.bottom, left: cell.col, right: source.left - 1 };
}

// Mod+D / Mod+R: the source and the cells it fills. A range copies its top row down (its leftmost
// column right); a single row (or column) of cells takes the row above (the column to the left),
// as in Excel. Null when there is nothing to copy from.
export function fillShortcut(
  rect: Rect,
  direction: "down" | "right",
): { source: Rect; target: Rect } | null {
  if (direction === "down") {
    if (rect.bottom > rect.top)
      return { source: { ...rect, bottom: rect.top }, target: { ...rect, top: rect.top + 1 } };
    if (rect.top === 0) return null;
    return { source: { ...rect, top: rect.top - 1, bottom: rect.top - 1 }, target: rect };
  }
  if (rect.right > rect.left)
    return { source: { ...rect, right: rect.left }, target: { ...rect, left: rect.left + 1 } };
  if (rect.left === 0) return null;
  return { source: { ...rect, left: rect.left - 1, right: rect.left - 1 }, target: rect };
}

export type FillValue =
  | { kind: "number"; value: number }
  // `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]`.
  | { kind: "date"; value: string }
  | { kind: "other"; value: unknown };

const DATE = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/;

function decimals(n: number): number {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 || s.includes("e") ? 0 : s.length - dot - 1;
}

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function constantStep(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const step = values[1]! - values[0]!;
  for (let i = 2; i < values.length; i++) {
    if (Math.abs(values[i]! - values[i - 1]! - step) > 1e-9) return null;
  }
  return step;
}

type DateParts = { y: number; m: number; d: number; time: string };

function dateParts(value: string): DateParts | null {
  const m = DATE.exec(value);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), time: m[4] ?? "" } : null;
}

function formatDate(y: number, m: number, d: number, time: string): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}${time}`;
}

function addDays(p: DateParts, days: number): string {
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return formatDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), p.time);
}

function addMonths(p: DateParts, months: number): string {
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return formatDate(y, m, Math.min(p.d, last), p.time);
}

const dayNumber = (p: DateParts) => Date.UTC(p.y, p.m - 1, p.d) / 86_400_000;

// `count` values continuing `source` (in order of distance from it). `backward`: the values go
// before the source (a fill upwards or to the left).
export function extendSeries(
  source: readonly FillValue[],
  count: number,
  backward = false,
): FillValue[] {
  const n = source.length;
  if (n === 0 || count <= 0) return [];
  const out: FillValue[] = [];
  const repeat = () => {
    for (let k = 1; k <= count; k++) {
      out.push(backward ? source[(((n - k) % n) + n) % n]! : source[(k - 1) % n]!);
    }
    return out;
  };
  if (n < 2) return repeat();

  if (source.every((v) => v.kind === "number")) {
    const values = source.map((v) => v.value as number);
    const step = constantStep(values);
    if (step === null) return repeat();
    const places = Math.max(...values.map(decimals));
    for (let k = 1; k <= count; k++) {
      const value = backward ? values[0]! - step * k : values[n - 1]! + step * k;
      out.push({ kind: "number", value: roundTo(value, places) });
    }
    return out;
  }

  if (source.every((v) => v.kind === "date")) {
    const parts = source.map((v) => dateParts(v.value as string));
    if (parts.some((p) => !p) || new Set(parts.map((p) => p!.time)).size > 1) return repeat();
    const ps = parts as DateParts[];
    const sameDay = ps.every((p) => p.d === ps[0]!.d);
    const monthStep = sameDay ? constantStep(ps.map((p) => p.y * 12 + p.m)) : null;
    if (monthStep !== null && monthStep !== 0) {
      const from = backward ? ps[0]! : ps[n - 1]!;
      for (let k = 1; k <= count; k++)
        out.push({ kind: "date", value: addMonths(from, (backward ? -k : k) * monthStep) });
      return out;
    }
    const dayStep = constantStep(ps.map(dayNumber));
    if (dayStep === null) return repeat();
    const from = backward ? ps[0]! : ps[n - 1]!;
    for (let k = 1; k <= count; k++)
      out.push({ kind: "date", value: addDays(from, (backward ? -k : k) * dayStep) });
    return out;
  }

  return repeat();
}

// Text ending in a number ("Week 1", "Week 2"): the same series on the number, else null.
export function extendTextSeries(
  source: readonly string[],
  count: number,
  backward = false,
): string[] | null {
  if (source.length < 2) return null;
  const parts = source.map((s) => /^(.*?)(-?\d+)$/.exec(s));
  if (parts.some((p) => !p) || new Set(parts.map((p) => p![1])).size > 1) return null;
  const prefix = parts[0]![1]!;
  const numbers = extendSeries(
    parts.map((p) => ({ kind: "number" as const, value: Number(p![2]) })),
    count,
    backward,
  );
  if (
    numbers.some((v, i) => v.kind !== "number" || (i === 0 && v.value === Number(parts.at(-1)![2])))
  )
    return null;
  return numbers.map((v) => `${prefix}${v.value as number}`);
}
