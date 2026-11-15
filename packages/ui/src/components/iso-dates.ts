import {
  CalendarDate,
  CalendarDateTime,
  getLocalTimeZone,
  parseDate,
  parseDateTime,
  toCalendarDate,
  today,
} from "@internationalized/date";
import type { DateValue } from "@internationalized/date";

// The date components take and give ISO text ("2026-11-15", or "2026-11-15T09:30" with a time),
// the form values are stored in, so callers never handle @internationalized/date's objects.

export function fromIso(iso: string | null | undefined, withTime: boolean): DateValue | null {
  if (!iso) return null;
  try {
    if (!withTime) return parseDate(iso.slice(0, 10));
    return iso.includes("T")
      ? parseDateTime(iso.slice(0, 16))
      : new CalendarDateTime(...ymd(parseDate(iso.slice(0, 10))), 9, 0);
  } catch {
    return null;
  }
}

export function dayOf(iso: string | null | undefined): CalendarDate | null {
  const value = fromIso(iso, false);
  return value ? toCalendarDate(value) : null;
}

export function toIso(value: DateValue): string {
  return value instanceof CalendarDateTime ? value.toString().slice(0, 16) : value.toString();
}

export function todayDate(): CalendarDate {
  return today(getLocalTimeZone());
}

function ymd(date: CalendarDate): [number, number, number] {
  return [date.year, date.month, date.day];
}
