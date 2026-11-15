// Date formats for plugins (daily note names, template variables): the Moment-style tokens that
// Obsidian's daily notes use, so a vault's existing format keeps working.
//   YYYY  2026     MM  01–12   M  1–12    MMM  Jan    MMMM  January
//   DD    01–31    D   1–31    ddd  Mon   dddd  Monday
//   HH    00–23    mm  00–59   [text] is literal.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TOKEN = /\[[^\]]*\]|YYYY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|mm/g;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(date: Date, format = "YYYY-MM-DD"): string {
  return format.replace(TOKEN, (token) => {
    switch (token) {
      case "YYYY":
        return String(date.getFullYear());
      case "MMMM":
        return MONTHS[date.getMonth()]!;
      case "MMM":
        return MONTHS[date.getMonth()]!.slice(0, 3);
      case "MM":
        return pad(date.getMonth() + 1);
      case "M":
        return String(date.getMonth() + 1);
      case "DD":
        return pad(date.getDate());
      case "D":
        return String(date.getDate());
      case "dddd":
        return DAYS[date.getDay()]!;
      case "ddd":
        return DAYS[date.getDay()]!.slice(0, 3);
      case "HH":
        return pad(date.getHours());
      case "mm":
        return pad(date.getMinutes());
      default:
        return token.slice(1, -1);
    }
  });
}

// The local date a string in `format` names, or null when it does not match.
export function parseDate(text: string, format = "YYYY-MM-DD"): Date | null {
  const fields: string[] = [];
  let source = "";
  let last = 0;
  for (const m of format.matchAll(TOKEN)) {
    source += format.slice(last, m.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    last = m.index + m[0].length;
    const token = m[0];
    if (token.startsWith("[")) {
      source += token.slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
    fields.push(token);
    source +=
      token === "YYYY"
        ? "(\\d{4})"
        : token === "MMMM" || token === "dddd"
          ? "([A-Za-z]+)"
          : token === "MMM" || token === "ddd"
            ? "([A-Za-z]{3})"
            : token.length === 2
              ? "(\\d{2})"
              : "(\\d{1,2})";
  }
  source += format.slice(last).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${source}$`).exec(text.trim());
  if (!match) return null;
  let year = 1970;
  let month = 0;
  let day = 1;
  fields.forEach((token, i) => {
    const value = match[i + 1]!;
    if (token === "YYYY") year = Number(value);
    else if (token === "MM" || token === "M") month = Number(value) - 1;
    else if (token === "MMMM" || token === "MMM")
      month = MONTHS.findIndex((m) => m.toLowerCase().startsWith(value.toLowerCase().slice(0, 3)));
    else if (token === "DD" || token === "D") day = Number(value);
  });
  const date = new Date(year, month, day);
  if (month < 0 || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

// Midnight of the same local day.
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
