// Cell values as text and back, for copy, paste and fill: what a cell copies, how pasted text
// becomes a value of the column's type (numbers with separators and currency, dates, option
// names, checkboxes, relation titles, people by name), and how a fill extends the source cells.
// Pure, apart from the resolvers the table passes in.
import {
  isEditableType,
  isUuid,
  parseDateValue,
  relatedRows,
  rowValue,
  valueText,
} from "@lydie/plugin-api/databases";
import type { DatabaseProperty, PropertyValue, ViewRow } from "@lydie/plugin-api/databases";
import {
  extendSeries,
  extendTextSeries,
  matchName,
  parseBooleanText,
  parseDateRangeText,
  parseNumberText,
  splitList,
} from "@lydie/plugin-api/grid";
import type { FillValue } from "@lydie/plugin-api/grid";

export type Resolvers = {
  // Row ids for titles in a relation's target database (null for a title it does not know).
  relation?: (property: DatabaseProperty, title: string) => string | null;
  // A user id for a name or email.
  person?: (text: string) => string | null;
};

// What a cell copies.
export function cellText(property: DatabaseProperty, row: ViewRow): string {
  return valueText(property, rowValue(property, row), relatedRows(property, row));
}

// The value pasted text gives a column: `{ value }`, or null when the text does not fit the type
// (the cell is left as it was). Titles are not values (they rename); computed columns take nothing.
export function parseCell(
  property: DatabaseProperty,
  text: string,
  resolvers: Resolvers = {},
): { value: PropertyValue } | null {
  if (property.type === "title" || !isEditableType(property.type)) return null;
  const trimmed = text.trim();
  if (trimmed === "") return { value: null };
  const options = (property.config.options ?? []).map((o) => o.name);
  switch (property.type) {
    case "text":
      return { value: text };
    case "url":
    case "email":
    case "phone":
      return { value: trimmed };
    case "number": {
      const n = parseNumberText(trimmed);
      return n === null ? null : { value: n };
    }
    case "checkbox": {
      const b = parseBooleanText(trimmed);
      return b === null ? null : { value: b };
    }
    case "select":
    case "status":
      return { value: matchName(options, trimmed) ?? trimmed };
    case "multiSelect": {
      const names = splitList(trimmed).map((name) => matchName(options, name) ?? name);
      return { value: names.length ? [...new Set(names)] : null };
    }
    case "date": {
      const parsed = parseDateRangeText(trimmed);
      if (!parsed) return null;
      const parts = parseDateValue(parsed)!;
      return { value: property.config.range ? parsed : parts.start };
    }
    case "person": {
      const ids = splitList(trimmed).map((item) => resolvers.person?.(item) ?? null);
      return ids.every((id): id is string => id !== null) ? { value: ids } : null;
    }
    case "files":
      return { value: splitList(trimmed) };
    case "relation": {
      const items = splitList(trimmed);
      const ids = items.map((item) =>
        isUuid(item) ? item : (resolvers.relation?.(property, item) ?? null),
      );
      if (!ids.every((id): id is string => id !== null)) return null;
      const limited = property.config.relation?.limit === "one" ? ids.slice(0, 1) : ids;
      return { value: [...new Set(limited)] };
    }
    default:
      return null;
  }
}

// Relation cells whose text names rows by title (so the table knows to look them up first).
export function needsRelationLookup(property: DatabaseProperty, text: string): boolean {
  return property.type === "relation" && splitList(text).some((item) => !isUuid(item));
}

// ---- Fill

// A source cell for a fill: its value and its text.
export type FillCell = { property: DatabaseProperty; row: ViewRow };

function fillValueOf({ property, row }: FillCell): FillValue {
  const value = rowValue(property, row);
  if (property.type === "number" && typeof value === "number") return { kind: "number", value };
  if (property.type === "date" && typeof value === "string" && !value.includes("/", 10))
    return { kind: "date", value };
  return { kind: "other", value: { property, value, text: cellText(property, row) } };
}

type Other = { property: DatabaseProperty; value: unknown; text: string };

export type FillWrite =
  | { kind: "title"; title: string }
  | { kind: "value"; value: PropertyValue }
  | { kind: "skip" };

// The writes for `count` target cells (in order of distance from the source) along one line of a
// fill. Down/up a column the values are the column's own (series for numbers, dates and
// "Week 1"-style text); across columns each target parses the source's text for its own type.
export function fillLine(
  source: readonly FillCell[],
  targets: readonly DatabaseProperty[],
  backward: boolean,
  resolvers: Resolvers = {},
): FillWrite[] {
  const values = source.map(fillValueOf);
  const texts = source.map((c) => cellText(c.property, c.row));
  const textSeries = extendTextSeries(texts, targets.length, backward);
  const series = extendSeries(values, targets.length, backward);
  return targets.map((property, i) => {
    if (property.type === "title") {
      const title = textSeries?.[i] ?? textOf(series[i]!);
      return title.trim() ? { kind: "title", title: title.trim() } : { kind: "skip" };
    }
    if (!isEditableType(property.type)) return { kind: "skip" };
    const v = series[i]!;
    if (v.kind === "number" && property.type === "number") return { kind: "value", value: v.value };
    if (v.kind === "date" && property.type === "date") return { kind: "value", value: v.value };
    if (v.kind === "other") {
      const other = v.value as Other;
      if (other.property.id === property.id)
        return { kind: "value", value: (other.value ?? null) as PropertyValue };
    }
    const text = textSeries?.[i] ?? textOf(v);
    const parsed = parseCell(property, text, resolvers);
    return parsed ? { kind: "value", value: parsed.value } : { kind: "skip" };
  });
}

function textOf(v: FillValue): string {
  if (v.kind === "other") return (v.value as Other).text;
  return String(v.value);
}
