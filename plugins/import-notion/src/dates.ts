// Notion writes dates as the person's settings show them: "@March 1, 2024", "@01/03/2024 3:00 PM
// (GMT+1)", a range "March 1, 2024 → March 3, 2024", or a range in one day whose end is only a
// time. The time is kept as written (wall clock); a time zone is dropped.
import { parseDateText } from "@lydie/plugin-api/grid";

const ZONE = /\s*\((?:GMT|UTC)?[+-]?[\d:]*\)$|\s*\([A-Z]{2,5}\)$/;

function clean(text: string): string {
  return text
    .replace(/^\s*@\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ZONE, "")
    .trim();
}

// Whether numeric dates in this export put the day first ("23/09/2026"): any date whose first
// number cannot be a month says so.
export function inferDayFirst(texts: Iterable<string>): boolean {
  for (const t of texts) {
    const m = /(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/.exec(t);
    if (!m) continue;
    if (Number(m[1]) > 12) return true;
    if (Number(m[2]) > 12) return false;
  }
  return false;
}

export type NotionDate = { value: string; time: boolean; range: boolean };

// A date value as Lydie stores it (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `start/end`), or null.
export function parseNotionDate(
  text: string,
  datetime: string | null = null,
  options: { dayFirst?: boolean } = {},
): NotionDate | null {
  const parts = clean(text)
    .split(/\s*→\s*/)
    .map(clean)
    .filter(Boolean);
  if (parts.length === 0 && !datetime) return null;
  const startText = parts[0] ?? "";
  const iso = datetime ? parseDateText(datetime.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "")) : null;
  const start = iso ?? parseDateText(startText, options);
  if (!start) return null;
  let end: string | null = null;
  if (parts.length > 1) {
    const endText = parts[1]!;
    // "March 1, 2024 3:00 PM → 5:00 PM": the end is on the start's day.
    end = /^\d{1,2}:\d{2}/.test(endText)
      ? parseDateText(`${start.slice(0, 10)} ${endText}`)
      : parseDateText(endText, options);
    if (!end) return null;
  }
  const value = end ? `${start}/${end}` : start;
  return { value, time: value.includes("T"), range: end !== null };
}
