// How each property type's value is stored in a row's properties, checked and converted. In a
// folder the same values are the row's frontmatter, except relation and files values, which are
// document/attachment ids in the database and links in the file (`toFileValue`/`fromFileValue`).
//
// | type        | stored value                         | frontmatter                       |
// | ----------- | ------------------------------------ | --------------------------------- |
// | text, url, email, phone | string                   | string                            |
// | number      | number                               | number                            |
// | select, status | option name                       | string                            |
// | multiSelect | option names (string[])              | list                              |
// | date        | "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm[:ss]", with an end: "start/end" | string |
// | checkbox    | boolean                              | boolean                           |
// | person      | user ids (string[])                  | list                              |
// | files       | attachment ids or URLs (string[])    | list of "[[path]]" or URLs        |
// | relation    | document ids (string[])              | list of "[[Path/Title]]"          |
// | uniqueId    | positive integer, shown "PREFIX-N"   | number                            |
// | title, createdTime, updatedTime, createdBy, updatedBy | document columns, not stored  |
// | formula, rollup | computed, not stored             | (formula in the .base file)       |
import type { PropertyValue } from "../entities.ts";
import { isUuid } from "../ids.ts";
import type { PropertyConfig, PropertyType } from "./entities.ts";
import { isStoredType, LIST_TYPES } from "./entities.ts";

const DATE_PART = String.raw`\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?`;
const DATE = new RegExp(`^${DATE_PART}$`);
const DATE_RANGE = new RegExp(`^(${DATE_PART})/(${DATE_PART})$`);

export type ValueCheck = { ok: true; value: PropertyValue } | { ok: false; message: string };

type Typed = { type: PropertyType; config?: PropertyConfig };

// Checks (and lightly normalises) a value for a property: trims select names, wraps a single
// string for list types, de-duplicates lists. null clears the value.
export function checkValue(p: Typed, value: PropertyValue): ValueCheck {
  const fail = (message: string): ValueCheck => ({ ok: false, message });
  if (!isStoredType(p.type)) return fail(`${p.type} values are computed, not set`);
  if (value === null) return { ok: true, value: null };
  switch (p.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
      if (typeof value === "number") return { ok: true, value: String(value) };
      return typeof value === "string" ? { ok: true, value } : fail("Expected text");
    case "number": {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      return typeof n === "number" && Number.isFinite(n)
        ? { ok: true, value: n }
        : fail("Expected a number");
    }
    case "select":
    case "status": {
      if (typeof value !== "string") return fail("Expected an option name");
      const name = value.trim();
      return name ? { ok: true, value: name } : { ok: true, value: null };
    }
    case "checkbox":
      return typeof value === "boolean" ? { ok: true, value } : fail("Expected true or false");
    case "uniqueId": {
      const n =
        typeof value === "number" || typeof value === "string"
          ? parseUniqueId(value, p.config?.prefix)
          : null;
      return n === null
        ? fail(
            `Expected a positive whole number${p.config?.prefix ? ` or ${p.config.prefix}-N` : ""}`,
          )
        : { ok: true, value: n };
    }
    case "date": {
      if (typeof value !== "string") return fail("Expected an ISO date");
      const v = value.trim();
      if (DATE.test(v)) return { ok: true, value: v };
      if (DATE_RANGE.test(v)) {
        return p.config?.range
          ? { ok: true, value: v }
          : fail("This date property has no end date");
      }
      return fail("Expected YYYY-MM-DD, YYYY-MM-DDTHH:mm or start/end");
    }
    default: {
      // List types.
      const items = typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
      if (!items) return fail("Expected a list of strings");
      let list = [...new Set(items.map((s) => s.trim()).filter((s) => s !== ""))];
      if (p.type === "relation") {
        if (list.some((id) => !isUuid(id))) return fail("Relation values are document ids");
        if (p.config?.relation?.limit === "one") list = list.slice(0, 1);
      }
      return { ok: true, value: list.length > 0 ? list : null };
    }
  }
}

// "LYD-12" with a prefix, "12" without one.
export function formatUniqueId(n: number, prefix?: string | null): string {
  return prefix ? `${prefix}-${n}` : String(n);
}

// The number of a unique id written as 12, "12" or "PREFIX-12" (prefix case-insensitive; with no
// prefix configured only the bare number). null for anything else, including 0 and fractions.
export function parseUniqueId(value: string | number, prefix?: string | null): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  const m = /^(?:([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/.exec(value.trim());
  if (!m) return null;
  if (m[1] !== undefined && (!prefix || m[1].toLowerCase() !== prefix.toLowerCase())) return null;
  return parseUniqueId(Number(m[2]), prefix);
}

// "LYD-12" as { prefix: "LYD", n: 12 } (a unique id typed into a search box), else null.
export function splitUniqueId(text: string): { prefix: string; n: number } | null {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(text.trim());
  const n = m ? Number(m[2]) : 0;
  return m && Number.isSafeInteger(n) && n > 0 ? { prefix: m[1]!, n } : null;
}

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "x", "checked", "done", "on"]);

export type ConvertContext = {
  // Titles of related documents, for relation → text/select conversions.
  titleOf?: (id: string) => string | null;
};

const asText = (value: PropertyValue, from: PropertyType, ctx: ConvertContext): string | null => {
  if (value === null) return null;
  if (Array.isArray(value)) {
    const items = from === "relation" ? value.map((id) => ctx.titleOf?.(id) ?? id) : value;
    return items.length > 0 ? items.join(", ") : null;
  }
  return String(value);
};

const splitList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

// Converts a stored value when a property changes type. Returns null to clear it. Conversions to
// computed types leave the values in place (they are not called).
//
// | to \ from        | text-like | number | select | list | date | checkbox |
// | text, url, email, phone | as is | "12.5" | name | "a, b" (relation: titles) | as is | "true"/"false" |
// | number           | first number in it | as is | first number | null | null | 1 / 0 |
// | select, status   | trimmed text | "12.5" | as is | first item | as is | "true"/"false" |
// | multiSelect, person, files | split on "," | ["12.5"] | [name] | as is (relation: titles) | [date] | ["true"] |
// | relation         | ids among the "," parts | null | null | ids kept | null | null |
// | date             | the date if it starts with one | null | same | null | as is | null |
// | checkbox         | yes/true/1/x/done… | ≠ 0 | same as text | non-empty | null | as is |
// | uniqueId         | "12" | positive integers | null | null | null | null |
export function convertValue(
  value: PropertyValue,
  from: PropertyType,
  to: PropertyType,
  ctx: ConvertContext = {},
): PropertyValue {
  if (value === null || value === undefined) return null;
  const text = asText(value, from, ctx);
  switch (to) {
    case "text":
    case "url":
    case "email":
    case "phone":
      return text;
    case "number": {
      if (typeof value === "number") return value;
      if (typeof value === "boolean") return value ? 1 : 0;
      if (Array.isArray(value) || from === "date") return null;
      const m = /-?\d+(?:\.\d+)?/.exec(String(value));
      return m ? Number(m[0]) : null;
    }
    case "select":
    case "status":
      if (Array.isArray(value)) {
        const first = from === "relation" ? (ctx.titleOf?.(value[0] ?? "") ?? value[0]) : value[0];
        return first?.trim() || null;
      }
      return text?.trim() || null;
    case "multiSelect":
    case "person":
    case "files": {
      if (Array.isArray(value)) {
        const items =
          from === "relation" && to === "multiSelect"
            ? value.map((id) => ctx.titleOf?.(id) ?? id)
            : value;
        return items.length > 0 ? [...new Set(items)] : null;
      }
      const items = typeof value === "string" ? splitList(value) : [String(value)];
      return items.length > 0 ? [...new Set(items)] : null;
    }
    case "relation": {
      const items = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? splitList(value)
          : [];
      const ids = items.filter((s) => isUuid(s));
      return ids.length > 0 ? [...new Set(ids)] : null;
    }
    case "date": {
      if (typeof value !== "string") return null;
      const v = value.trim();
      if (DATE.test(v) || DATE_RANGE.test(v)) return v;
      const m = /^\d{4}-\d{2}-\d{2}/.exec(v);
      return m ? m[0] : null;
    }
    case "uniqueId":
      // Changing a property to uniqueId numbers the rows afresh (the runtime); this is for single values.
      return typeof value === "number" || typeof value === "string" ? parseUniqueId(value) : null;
    case "checkbox":
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      if (Array.isArray(value)) return value.length > 0;
      return from === "date" ? null : TRUE_WORDS.has(String(value).trim().toLowerCase());
    default:
      return value;
  }
}

// ---- Files on disk

const WIKILINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/;

export type FileValueContext = {
  // Vault-relative link target for a document or attachment id (no brackets), e.g. "Tasks/Write".
  linkFor?: (id: string) => string | null;
  // The document or attachment a link target resolves to.
  idFor?: (target: string) => string | null;
};

// The frontmatter value for a stored value: relation and files ids become "[[target]]" links.
export function toFileValue(
  p: Typed,
  value: PropertyValue,
  ctx: FileValueContext = {},
): PropertyValue {
  if (!Array.isArray(value) || (p.type !== "relation" && p.type !== "files")) return value;
  return value.map((item) => {
    if (!isUuid(item)) return item;
    const target = ctx.linkFor?.(item);
    return target ? `[[${target}]]` : item;
  });
}

// The stored value for a frontmatter value. Links that do not resolve stay as written, so nothing
// in the file is lost; queries treat them as unresolved.
export function fromFileValue(p: Typed, value: unknown, ctx: FileValueContext = {}): PropertyValue {
  if (value === undefined) return null;
  if (p.type === "relation" || p.type === "files") {
    const items = Array.isArray(value)
      ? value.map(scalarText)
      : value === null
        ? []
        : [scalarText(value)];
    const out = items.map((item) => {
      const m = WIKILINK.exec(item.trim());
      return m ? (ctx.idFor?.(m[1]!.trim()) ?? item) : item;
    });
    return out.length > 0 ? out : null;
  }
  if (LIST_TYPES.includes(p.type)) {
    if (value === null) return null;
    return Array.isArray(value) ? value.map(scalarText) : [scalarText(value)];
  }
  if (p.type === "date" && value instanceof Date) return value.toISOString().slice(0, 10);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function scalarText(value: unknown): string {
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value as string);
}
