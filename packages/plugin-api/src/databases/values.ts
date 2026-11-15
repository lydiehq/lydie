// Reading, formatting and parsing property values for display and editing. Pure functions shared
// by the properties panel and the database views.
import { convertValue, formatUniqueId, isStoredType, parseUniqueId } from "@lydie/contract";
import type {
  Color,
  PropertyConfig,
  PropertyType,
  PropertyValue,
  RelatedRow,
  SelectOption,
  ViewRow,
} from "@lydie/contract";

// What the editors need of a property: a database property, or one inferred from a page's values.
export type PropertyLike = {
  id: string;
  name: string;
  type: PropertyType;
  key: string;
  config: PropertyConfig;
  // Set for database properties (options can be recoloured, config changed).
  databaseId?: string;
};

export const TYPE_LABELS: Record<PropertyType, string> = {
  title: "Title",
  text: "Text",
  number: "Number",
  select: "Select",
  multiSelect: "Multi-select",
  status: "Status",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  phone: "Phone",
  person: "Person",
  files: "Files",
  relation: "Relation",
  rollup: "Rollup",
  formula: "Formula",
  uniqueId: "ID",
  createdTime: "Created",
  updatedTime: "Updated",
  createdBy: "Created by",
  updatedBy: "Updated by",
};

// Plain-text glyphs, for places that cannot draw an icon. The UI uses TYPE_ICONS / TypeIcon.
export const TYPE_GLYPHS: Record<PropertyType, string> = {
  title: "Aa",
  text: "≡",
  number: "#",
  select: "◉",
  multiSelect: "☰",
  status: "◐",
  date: "▦",
  checkbox: "☑",
  url: "🔗",
  email: "@",
  phone: "☎",
  person: "👤",
  files: "📎",
  relation: "↗",
  rollup: "Σ",
  formula: "ƒ",
  uniqueId: "№",
  createdTime: "◷",
  updatedTime: "◷",
  createdBy: "👤",
  updatedBy: "👤",
};

// Types a user can pick when adding a property (title is fixed; computed people/time types too).
export const ADDABLE_TYPES: readonly PropertyType[] = [
  "text",
  "number",
  "select",
  "multiSelect",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "person",
  "files",
  "relation",
  "rollup",
  "formula",
  "uniqueId",
  "createdTime",
  "updatedTime",
  "createdBy",
  "updatedBy",
];

// Types a page outside a database can hold (stored, no schema).
export const PAGE_TYPES: readonly PropertyType[] = [
  "text",
  "number",
  "multiSelect",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
];

export const OPTION_COLORS: Record<Color, string> = {
  default: "bg-gray-100 text-gray-800",
  gray: "bg-gray-200 text-gray-800",
  brown: "bg-amber-100 text-amber-900",
  orange: "bg-orange-100 text-orange-900",
  yellow: "bg-yellow-100 text-yellow-900",
  green: "bg-green-100 text-green-900",
  blue: "bg-blue-100 text-blue-900",
  purple: "bg-purple-100 text-purple-900",
  pink: "bg-pink-100 text-pink-900",
  red: "bg-red-100 text-red-900",
};

export const isListType = (type: PropertyType) =>
  type === "multiSelect" || type === "person" || type === "files" || type === "relation";

// Unique ids are stored but assigned, never edited by hand.
export const isEditableType = (type: PropertyType) =>
  type === "title" || (isStoredType(type) && type !== "uniqueId");

export function optionsOf(property: PropertyLike): readonly SelectOption[] {
  return property.config.options ?? [];
}

export function optionFor(property: PropertyLike, name: string): SelectOption | null {
  return optionsOf(property).find((o) => o.name === name) ?? null;
}

// The value a row holds for a property: stored values from its properties, the title and the
// document columns, computed values (relations with titles, rollups, formulas) from `computed`.
export function rowValue(property: PropertyLike, row: ViewRow): unknown {
  switch (property.type) {
    case "title":
      return row.title;
    case "createdTime":
      return row.createdAt;
    case "updatedTime":
      return row.updatedAt;
    case "createdBy":
      return row.createdBy;
    case "updatedBy":
      return row.updatedBy;
    case "rollup":
    case "formula":
      return row.computed[property.id] ?? null;
    default:
      return row.properties[property.key] ?? null;
  }
}

// Relation targets with titles, when the view computed them.
export function relatedRows(property: PropertyLike, row: ViewRow): RelatedRow[] | null {
  const computed = row.computed[property.id];
  return Array.isArray(computed) ? (computed as RelatedRow[]) : null;
}

export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DateParts = { start: string; end: string | null };

export function parseDateValue(value: unknown): DateParts | null {
  if (typeof value !== "string" || value === "") return null;
  const slash = value.indexOf("/", 10);
  return slash === -1
    ? { start: value, end: null }
    : { start: value.slice(0, slash), end: value.slice(slash + 1) };
}

export function joinDate(parts: DateParts): string {
  return parts.end ? `${parts.start}/${parts.end}` : parts.start;
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const date = `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
  return m[4] ? `${date} ${m[4]}:${m[5]}` : date;
}

export function formatNumber(value: number, config: PropertyConfig): string {
  const decimals = config.decimals;
  switch (config.numberFormat) {
    case "integer":
      return String(Math.round(value));
    case "commas":
      return value.toLocaleString("en-US", {
        ...(decimals !== undefined
          ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
          : {}),
      });
    case "percent":
      return `${(value * 100).toFixed(decimals ?? 0)}%`;
    case "currency":
      return value.toLocaleString("en-US", {
        style: "currency",
        currency: config.currency ?? "USD",
        ...(decimals !== undefined
          ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
          : {}),
      });
    default:
      return decimals !== undefined ? value.toFixed(decimals) : String(value);
  }
}

// Text for a value: what a cell copies, what search and summaries read.
export function valueText(
  property: PropertyLike,
  value: unknown,
  related?: readonly RelatedRow[] | null,
): string {
  if (isEmptyValue(value)) return "";
  switch (property.type) {
    case "number":
      return typeof value === "number" ? formatNumber(value, property.config) : String(value);
    case "checkbox":
      return value === true ? "Yes" : "No";
    case "uniqueId":
      return typeof value === "number"
        ? formatUniqueId(value, property.config.prefix)
        : String(value);
    case "date": {
      const parts = parseDateValue(value);
      if (!parts) return String(value);
      return parts.end
        ? `${formatDate(parts.start)} → ${formatDate(parts.end)}`
        : formatDate(parts.start);
    }
    case "createdTime":
    case "updatedTime":
      return typeof value === "string" ? formatDate(value.replace("Z", "")) : String(value);
    case "relation":
      if (related) return related.map((r) => r.title || "Untitled").join(", ");
      return Array.isArray(value) ? value.join(", ") : String(value);
    default:
      if (Array.isArray(value)) {
        return value
          .map((v) =>
            typeof v === "object" && v !== null && "title" in v
              ? String((v as RelatedRow).title)
              : String(v),
          )
          .join(", ");
      }
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

// The stored value for text typed or pasted into a cell (TSV paste, type-to-edit). Relations take
// ids; titles are resolved by the caller.
export function parseValueText(property: PropertyLike, text: string): PropertyValue {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (property.type === "checkbox") {
    return /^(true|yes|y|1|x|checked|done|on|✓)$/i.test(trimmed);
  }
  if (property.type === "date") {
    const parsed = Date.parse(trimmed);
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return convertValue(trimmed, "text", "date");
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return null;
  }
  if (property.type === "number") {
    const n = Number(trimmed.replace(/[,\s$€£%]/g, ""));
    if (Number.isFinite(n)) return trimmed.endsWith("%") ? n / 100 : n;
    return convertValue(trimmed, "text", "number");
  }
  if (property.type === "uniqueId") return parseUniqueId(trimmed, property.config.prefix);
  return convertValue(text, "text", property.type);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isUrlLike(text: string): boolean {
  return /^https?:\/\//i.test(text);
}
