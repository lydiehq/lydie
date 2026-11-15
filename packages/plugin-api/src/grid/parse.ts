// Type-aware reading of pasted or filled text: numbers as spreadsheets and locales write them
// (thousands separators, currency, percent, accounting negatives), dates in common orders,
// checkboxes, option names and lists. Each returns null for text it cannot read.

const CURRENCY =
  /[$€£¥₹₩₽₺₪฿₫₴₦₱]|\b(?:USD|EUR|GBP|JPY|CHF|SEK|NOK|DKK|CAD|AUD|NZD|INR|CNY|BRL|kr)\b/gi;

// "1,234.5", "1.234,5", "$ 1 234", "€3,50", "(12)", "−7", "12%", "1e3".
export function parseNumberText(text: string): number | null {
  let s = text.trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s
    .replace(CURRENCY, "")
    .replace(/[\s  ']/g, "")
    .replace(/[−–]/g, "-");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  let percent = false;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+(e[+-]?\d+)?$/i.test(s) || !/\d/.test(s)) return null;
  const dot = s.lastIndexOf(".");
  const comma = s.lastIndexOf(",");
  if (dot !== -1 && comma !== -1) {
    // Both: the last one is the decimal separator.
    s = dot > comma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (comma !== -1) {
    // "1,234" and "1,234,567" are thousands; "3,5" and "1,23456" a decimal comma.
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else if (s.indexOf(",") === comma) s = s.replace(",", ".");
    else return null;
  } else if (dot !== -1 && s.indexOf(".") !== dot) {
    // "1.234.567": dots as thousands.
    if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const value = negative ? -n : n;
  return percent ? value / 100 : value;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function iso(y: number, m: number, d: number, time: string | null): string | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (!valid(y, m, d)) return null;
  return `${y}-${pad(m)}-${pad(d)}${time ? `T${time}` : ""}`;
}

function timeOf(text: string | undefined): string | null | undefined {
  if (!text) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(text.trim());
  if (!m) return undefined;
  let h = Number(m[1]);
  const ampm = m[4]?.[0]?.toLowerCase();
  if (ampm === "p" && h < 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  if (h > 23 || Number(m[2]) > 59) return undefined;
  return `${pad(h)}:${m[2]}${m[3] ? `:${m[3]}` : ""}`;
}

// One date (optionally with a time) as `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm`: ISO, "13.11.2026",
// "11/13/2026" (day first when the first number is over 12, or with `dayFirst`), "Nov 13, 2026",
// "13 November 2026".
export function parseDateText(text: string, options: { dayFirst?: boolean } = {}): string | null {
  const s = text.trim().replace(/\s+/g, " ");
  if (s === "") return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.+?))?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (m) {
    const time = timeOf(m[4]);
    return time === undefined ? null : iso(Number(m[1]), Number(m[2]), Number(m[3]), time);
  }
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?: (.+))?$/.exec(s);
  if (m) {
    const time = timeOf(m[4]);
    return time === undefined ? null : iso(Number(m[1]), Number(m[2]), Number(m[3]), time);
  }
  m = /^(\d{1,2})([./-])(\d{1,2})\2(\d{2}|\d{4})(?:,? (.+))?$/.exec(s);
  if (m) {
    const time = timeOf(m[5]);
    if (time === undefined) return null;
    const a = Number(m[1]);
    const b = Number(m[3]);
    const dayFirst = m[2] === "." || options.dayFirst === true || a > 12;
    return dayFirst ? iso(Number(m[4]), b, a, time) : iso(Number(m[4]), a, b, time);
  }
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
  // "Nov 13, 2026", "November 13 2026 14:00"
  m = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})(?:,? (.+))?$/i.exec(s);
  if (m && month(m[1]!) > 0) {
    const time = timeOf(m[4]);
    return time === undefined ? null : iso(Number(m[3]), month(m[1]!), Number(m[2]), time);
  }
  // "13 Nov 2026", "13. November 2026"
  m = /^(\d{1,2})\.? ([a-z]+)\.?,? (\d{4})(?:,? (.+))?$/i.exec(s);
  if (m && month(m[2]!) > 0) {
    const time = timeOf(m[4]);
    return time === undefined ? null : iso(Number(m[3]), month(m[2]!), Number(m[1]), time);
  }
  return null;
}

// A date or a range ("A → B", "A – B", "A to B") as stored: `start` or `start/end`.
export function parseDateRangeText(
  text: string,
  options: { dayFirst?: boolean } = {},
): string | null {
  const parts = text.split(/\s(?:→|->|–|—|to)\s/);
  if (parts.length === 2) {
    const start = parseDateText(parts[0]!, options);
    const end = parseDateText(parts[1]!, options);
    if (start && end) return `${start}/${end}`;
  }
  const iso = /^(\d{4}-\d{2}-\d{2}(?:T[\d:]+)?)\/(\d{4}-\d{2}-\d{2}(?:T[\d:]+)?)$/.exec(
    text.trim(),
  );
  if (iso) return `${iso[1]}/${iso[2]}`;
  return parseDateText(text, options);
}

const TRUE = /^(true|yes|y|1|x|checked|done|on|✓|✔|☑)$/i;
const FALSE = /^(false|no|n|0|unchecked|off|✗|☐|-)?$/i;

export function parseBooleanText(text: string): boolean | null {
  const s = text.trim();
  if (TRUE.test(s)) return true;
  if (FALSE.test(s)) return false;
  return null;
}

// Items of a list cell: separated by commas, semicolons or line breaks.
export function splitList(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// The option whose name matches `text` (exactly, then ignoring case and spacing), or null.
export function matchName(names: readonly string[], text: string): string | null {
  const s = text.trim();
  if (names.includes(s)) return s;
  const key = s.toLowerCase().replace(/\s+/g, " ");
  return names.find((n) => n.toLowerCase().replace(/\s+/g, " ") === key) ?? null;
}
