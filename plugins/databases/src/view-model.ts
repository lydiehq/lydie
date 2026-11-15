// Derived view state: columns in order, the table's flattened items (group headers, rows, "new"
// rows), group labels and column summaries. Pure functions.
import { isEmptyValue, parseDateValue, rowValue, valueText } from "@lydie/plugin-api/databases";
import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseView,
  GroupKey,
  ViewColumn,
  ViewGroup,
  ViewRow,
} from "@lydie/plugin-api/databases";

export const DEFAULT_WIDTH = 180;
export const TITLE_WIDTH = 280;

export type Column = { property: DatabaseProperty; width: number; visible: boolean };

export function titleProperty(definition: DatabaseDefinition): DatabaseProperty | null {
  return definition.properties.find((p) => p.type === "title") ?? null;
}

// Every property in the view's order (title first), with visibility and width.
export function allColumns(definition: DatabaseDefinition, view: DatabaseView): Column[] {
  const byId = new Map(definition.properties.map((p) => [p.id, p]));
  const listed = view.config.columns.filter((c) => byId.has(c.propertyId));
  const seen = new Set(listed.map((c) => c.propertyId));
  const rest: ViewColumn[] = definition.properties
    .filter((p) => !seen.has(p.id))
    .map((p) => ({ propertyId: p.id, visible: true }));
  const columns = [...listed, ...rest].map((c) => {
    const property = byId.get(c.propertyId)!;
    return {
      property,
      visible: property.type === "title" ? true : c.visible,
      width: c.width ?? (property.type === "title" ? TITLE_WIDTH : DEFAULT_WIDTH),
    };
  });
  const title = columns.findIndex((c) => c.property.type === "title");
  if (title > 0) columns.unshift(...columns.splice(title, 1));
  return columns;
}

export function visibleColumns(definition: DatabaseDefinition, view: DatabaseView): Column[] {
  return allColumns(definition, view).filter((c) => c.visible);
}

// The `columns` config after a change to one column (keeps every column listed so order sticks).
export function withColumn(
  columns: readonly Column[],
  propertyId: string,
  patch: Partial<Pick<ViewColumn, "visible" | "width">>,
): ViewColumn[] {
  return columns.map((c) => {
    const base: ViewColumn = {
      propertyId: c.property.id,
      visible: c.visible,
      ...(c.width !== (c.property.type === "title" ? TITLE_WIDTH : DEFAULT_WIDTH)
        ? { width: c.width }
        : {}),
    };
    return c.property.id === propertyId ? { ...base, ...patch } : base;
  });
}

// Moves `propertyId` before `beforeId` (or to the end).
export function movedColumns(
  columns: readonly Column[],
  propertyId: string,
  beforeId: string | null,
): ViewColumn[] {
  const config = withColumn(columns, propertyId, {});
  const moving = config.find((c) => c.propertyId === propertyId);
  if (!moving) return config;
  const rest = config.filter((c) => c.propertyId !== propertyId);
  const at = beforeId ? rest.findIndex((c) => c.propertyId === beforeId) : -1;
  rest.splice(at === -1 ? rest.length : at, 0, moving);
  return rest;
}

// ---- Table items

export type TableItem =
  | { kind: "group"; group: ViewGroup; collapsed: boolean }
  | { kind: "row"; position: number; group: GroupKey }
  | { kind: "add"; group: GroupKey | undefined };

// Group headers, row slots (positions in the ordered result) and a "New" row per group.
export function tableItems(
  total: number,
  groups: readonly ViewGroup[],
  grouped: boolean,
  collapsed: readonly GroupKey[],
): TableItem[] {
  if (!grouped) {
    const items: TableItem[] = Array.from({ length: total }, (_, position) => ({
      kind: "row" as const,
      position,
      group: null,
    }));
    items.push({ kind: "add", group: undefined });
    return items;
  }
  const items: TableItem[] = [];
  for (const group of groups) {
    if (group.subKey !== null) continue;
    const isCollapsed = collapsed.includes(group.key);
    items.push({ kind: "group", group, collapsed: isCollapsed });
    if (isCollapsed) continue;
    for (let i = 0; i < group.count; i++) {
      items.push({ kind: "row", position: group.start + i, group: group.key });
    }
    items.push({ kind: "add", group: group.key });
  }
  return items;
}

// Row slots to draw before the first result says how many pages there are: no page is at these
// positions yet, so each draws as a placeholder.
export function placeholderItems(count: number): TableItem[] {
  return Array.from({ length: count }, (_, position) => ({
    kind: "row" as const,
    position,
    group: null,
  }));
}

export function groupLabel(key: GroupKey, property: DatabaseProperty | undefined): string {
  if (key === null) return property ? `No ${property.name}` : "No value";
  if (property?.type === "checkbox") return key === "true" ? "Checked" : "Unchecked";
  return key;
}

// ---- Summaries

export const SUMMARIES = [
  "Count",
  "Filled",
  "Empty",
  "Unique",
  "Sum",
  "Average",
  "Median",
  "Min",
  "Max",
  "Range",
  "Checked",
  "Unchecked",
  "PercentChecked",
  "Earliest",
  "Latest",
] as const;
export type SummaryName = (typeof SUMMARIES)[number];

export const SUMMARY_LABELS: Record<SummaryName, string> = {
  Count: "Count all",
  Filled: "Count values",
  Empty: "Count empty",
  Unique: "Count unique",
  Sum: "Sum",
  Average: "Average",
  Median: "Median",
  Min: "Min",
  Max: "Max",
  Range: "Range",
  Checked: "Checked",
  Unchecked: "Unchecked",
  PercentChecked: "Percent checked",
  Earliest: "Earliest date",
  Latest: "Latest date",
};

export function summariesFor(property: DatabaseProperty): SummaryName[] {
  const common: SummaryName[] = ["Count", "Filled", "Empty", "Unique"];
  switch (property.type) {
    case "number":
    case "rollup":
    case "formula":
      return [...common, "Sum", "Average", "Median", "Min", "Max", "Range"];
    case "checkbox":
      return ["Count", "Checked", "Unchecked", "PercentChecked"];
    case "date":
    case "createdTime":
    case "updatedTime":
      return [...common, "Earliest", "Latest"];
    default:
      return common;
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

// One column's summary over all rows of the view.
export function summarize(
  name: string,
  property: DatabaseProperty,
  rows: readonly ViewRow[],
): string {
  const values = rows.map((row) => rowValue(property, row));
  const filled = values.filter((v) => !isEmptyValue(v));
  const numbers = filled.flatMap((v) => (typeof v === "number" ? [v] : []));
  const sorted = [...numbers].sort((a, b) => a - b);
  switch (name) {
    case "Count":
      return String(rows.length);
    case "Filled":
      return String(filled.length);
    case "Empty":
      return String(rows.length - filled.length);
    case "Unique":
      return String(new Set(filled.map((v) => JSON.stringify(v))).size);
    case "Sum":
      return String(round(numbers.reduce((a, b) => a + b, 0)));
    case "Average":
      return numbers.length
        ? String(round(numbers.reduce((a, b) => a + b, 0) / numbers.length))
        : "–";
    case "Median": {
      if (!sorted.length) return "–";
      const mid = Math.floor(sorted.length / 2);
      return String(
        round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2),
      );
    }
    case "Min":
      return sorted.length ? String(sorted[0]) : "–";
    case "Max":
      return sorted.length ? String(sorted.at(-1)) : "–";
    case "Range":
      return sorted.length ? String(round(sorted.at(-1)! - sorted[0]!)) : "–";
    case "Checked":
      return String(values.filter((v) => v === true).length);
    case "Unchecked":
      return String(values.filter((v) => v !== true).length);
    case "PercentChecked":
      return rows.length
        ? `${Math.round((values.filter((v) => v === true).length / rows.length) * 100)}%`
        : "–";
    case "Earliest":
    case "Latest": {
      const dates = filled
        .map((v) => (property.type === "date" ? parseDateValue(v)?.start : String(v)))
        .filter((d): d is string => Boolean(d))
        .sort();
      const pick = name === "Earliest" ? dates[0] : dates.at(-1);
      return pick ? valueText({ ...property, type: "date" }, pick) : "–";
    }
    default:
      return "";
  }
}
