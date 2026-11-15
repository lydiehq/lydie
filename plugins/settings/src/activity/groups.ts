import type { TimelineTimeFormat } from "@lydie/plugin-api/ui";

// Headings for the activity list: Today, then a day each for the past week ("Thursday 12
// November"), then weeks up to 60 days back, then months.

export type DateGroup<T> = {
  key: string;
  label: string;
  // How times read under this heading: relative today, the time on a past day, else the date.
  timeFormat: TimelineTimeFormat;
  entries: T[];
};

const DAY_MS = 86_400_000;
const DAYS_SHOWN = 7;
const WEEKS_UNTIL = 60;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Whole calendar days between two dates (daylight saving safe).
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

function ymd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateGroupOf(
  iso: string,
  now: Date = new Date(),
): Omit<DateGroup<never>, "entries"> {
  const date = new Date(iso);
  const age = daysBetween(date, now);
  // The future (another device's clock) counts as today.
  if (age <= 0) return { key: `day-${ymd(now)}`, label: "Today", timeFormat: "relative" };
  if (age < DAYS_SHOWN) {
    return {
      key: `day-${ymd(date)}`,
      label: new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(date),
      timeFormat: "time",
    };
  }
  if (age < WEEKS_UNTIL) {
    // Weeks start on Monday; the days already shown one by one are left out of the label.
    const start = addDays(startOfDay(date), -((date.getDay() + 6) % 7));
    const lastDayShown = addDays(startOfDay(now), -DAYS_SHOWN);
    const weekEnd = addDays(start, 6);
    const end = weekEnd < lastDayShown ? weekEnd : lastDayShown;
    const format = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      ...(start.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    });
    return {
      key: `week-${ymd(start)}`,
      label:
        start.getTime() === end.getTime() ? format.format(start) : format.formatRange(start, end),
      timeFormat: "date",
    };
  }
  return {
    key: `month-${date.getFullYear()}-${date.getMonth() + 1}`,
    label: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date),
    timeFormat: "date",
  };
}

// Entries newest first, in groups in the same order.
export function groupByDate<T>(
  entries: readonly T[],
  at: (entry: T) => string,
  now: Date = new Date(),
): DateGroup<T>[] {
  const groups = new Map<string, DateGroup<T>>();
  for (const entry of entries) {
    const group = dateGroupOf(at(entry), now);
    const existing = groups.get(group.key);
    if (existing) existing.entries.push(entry);
    else groups.set(group.key, { ...group, entries: [entry] });
  }
  return [...groups.values()];
}
