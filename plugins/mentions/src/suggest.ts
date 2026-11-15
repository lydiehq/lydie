// What `@` offers: dates ("today", "fri", "2026-12-01"), people (hosted workspaces) and pages.
// Stored portably (see the plugin's AGENTS.md): a page or a date is a wiki link (`[[Page]]`,
// `[[2026-11-13]]`), a person a Markdown link `[@Name](lydie:user/<id>)`.
import { addDays, formatDate, parseDate, startOfDay } from "@lydie/plugin-api";

export type Mention =
  | { kind: "date"; label: string; date: Date }
  | { kind: "person"; label: string; userId: string; detail?: string }
  | { kind: "page"; label: string; title: string };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const PERSON_SCHEME = "lydie:user/";

export function personHref(userId: string) {
  return `${PERSON_SCHEME}${encodeURIComponent(userId)}`;
}

export function userIdOf(href: string): string | null {
  return href.startsWith(PERSON_SCHEME)
    ? decodeURIComponent(href.slice(PERSON_SCHEME.length))
    : null;
}

// Dates a query names: relative words, weekdays (the next one), or a date in `format`/ISO.
export function dateMentions(query: string, now: Date, format: string): Mention[] {
  const q = query.trim().toLowerCase();
  const today = startOfDay(now);
  const named: [string, Date][] = [
    ["today", today],
    ["tomorrow", addDays(today, 1)],
    ["yesterday", addDays(today, -1)],
  ];
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    named.push([WEEKDAYS[day.getDay()]!, day]);
  }
  const out: Mention[] = [];
  for (const [word, date] of named) {
    if (q && !word.startsWith(q)) continue;
    if (!q && !["today", "tomorrow", "yesterday"].includes(word)) continue;
    const label = `${word[0]!.toUpperCase()}${word.slice(1)} · ${formatDate(date, format)}`;
    if (!out.some((m) => m.kind === "date" && m.date.getTime() === date.getTime()))
      out.push({ kind: "date", label, date });
  }
  const exact = parseDate(query, format) ?? parseDate(query, "YYYY-MM-DD");
  if (exact) out.unshift({ kind: "date", label: formatDate(exact, format), date: exact });
  return out;
}
