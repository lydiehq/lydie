// The database view engine in plain JavaScript: filter, sort, group and window a database's rows,
// and compute relation, rollup and formula cells. It defines the semantics; @lydie/store's SQL
// engine must give identical results (store/src/parity.test.ts checks), and falls back to this
// engine when a view filters, sorts or groups by a formula or rollup.
//
// Semantics, per property type:
// - Text compares are exact for eq/neq/in and ASCII-case-insensitive for contains/startsWith/
//   endsWith (SQLite's lower() folds ASCII only, so both engines do the same).
// - neq, notContains and notIn are the negation of eq, contains and in: rows without a value match.
// - lt/lte/gt/gte/between never match a missing value. Dates compare by day (the first 10
//   characters; a range compares its start) unless the filter value has a time.
// - Checkboxes are true only when stored as true.
// - Lists (multiSelect, person, files, relation): contains = has the item; in = has any of them.
// - Sorting: empty values last in both directions; select/status by option order; multiSelect by
//   its first option; person/files/relation by item count; text ASCII-case-insensitively; then
//   (sortKey, id).
// - Grouping explodes list values (a row with two tags is in both groups). Groups are ordered like
//   sorts with "no value" last; select/status show every option (unless hideEmpty); dates group
//   by bucket (default month; weeks start on Monday).
import { parseExpression, parseUniqueId } from "@lydie/contract";
import type {
  DatabaseConfig,
  DatabaseProperty,
  DateBucket,
  Expr,
  FilterNode,
  FilterScalar,
  FilterValue,
  GroupBy,
  GroupKey,
  RelatedRow,
  RelativeDate,
  ViewConfig,
  ViewGroup,
  ViewResult,
  ViewRow,
  ViewWindow,
} from "@lydie/contract";

import {
  DateValue,
  EvalError,
  evaluate,
  isEmptyValue,
  LinkValue,
  parseDate,
  toJson,
  truthy,
} from "./evaluate.ts";
import type { Scope, Value } from "./evaluate.ts";

export type PropertyLike = Pick<DatabaseProperty, "id" | "type" | "key" | "config">;

export type RowDoc = {
  id: string;
  title: string;
  sortKey: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null | undefined;
  updatedBy?: string | null | undefined;
};

export type ViewContext = {
  properties: readonly PropertyLike[];
  // Live documents that relations point at, by id.
  related: ReadonlyMap<string, RowDoc>;
  // Rollup target properties (they belong to other databases), by id.
  targets: ReadonlyMap<string, PropertyLike>;
  // The signed-in user's id, for { me: true }.
  me: string | null;
  now: number;
  // The user's local date, YYYY-MM-DD.
  today: string;
};

export const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

const LIST = new Set(["multiSelect", "person", "files", "relation"]);
const TEXT = new Set([
  "title",
  "text",
  "url",
  "email",
  "phone",
  "select",
  "status",
  "createdBy",
  "updatedBy",
]);
const DATES = new Set(["date", "createdTime", "updatedTime"]);

// The stored or column value of a property, normalised to its type's shape.
export function cellValue(row: RowDoc, p: PropertyLike): unknown {
  switch (p.type) {
    case "title":
      return row.title;
    case "createdTime":
      return row.createdAt;
    case "updatedTime":
      return row.updatedAt;
    case "createdBy":
      return row.createdBy ?? null;
    case "updatedBy":
      return row.updatedBy ?? null;
    case "formula":
    case "rollup":
      return null;
  }
  const raw = row.properties[p.key];
  if (raw === undefined || raw === null) return null;
  if (LIST.has(p.type)) {
    const items = Array.isArray(raw) ? raw : [raw];
    return items.filter((x) => x !== null && x !== undefined).map(itemText);
  }
  if (p.type === "checkbox") return raw === true;
  // Values of the wrong shape (hand-edited files) read the way SQLite's `->>` reports them, so
  // both engines agree: booleans as 1/0, lists and objects as JSON text.
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "object") return JSON.stringify(raw);
  return raw;
}

const itemText = (x: unknown) =>
  typeof x === "boolean"
    ? x
      ? "1"
      : "0"
    : typeof x === "object"
      ? JSON.stringify(x)
      : String(x as string | number);

const empty = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function addToDay(today: string, amount: number, unit: NonNullable<RelativeDate["unit"]>): string {
  const d = new Date(`${today}T00:00:00Z`);
  if (unit === "year") d.setUTCFullYear(d.getUTCFullYear() + amount);
  else if (unit === "month") d.setUTCMonth(d.getUTCMonth() + amount);
  else if (unit === "week") d.setUTCDate(d.getUTCDate() + 7 * amount);
  else if (unit === "day") d.setUTCDate(d.getUTCDate() + amount);
  else return today;
  return d.toISOString().slice(0, 10);
}

// A filter value with `me` and relative dates resolved: a string, number or boolean.
export function resolveScalar(
  v: FilterScalar,
  ctx: Pick<ViewContext, "me" | "now" | "today">,
): string | number | boolean | null {
  if (typeof v !== "object") return v;
  if ("me" in v) return ctx.me;
  const amount = v.amount ?? 0;
  const unit = v.unit ?? "day";
  if (v.relative === "today") return amount ? addToDay(ctx.today, amount, unit) : ctx.today;
  const ms = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[unit as "day"];
  if (ms) return new Date(ctx.now + amount * ms).toISOString();
  const d = new Date(ctx.now);
  if (unit === "month") d.setUTCMonth(d.getUTCMonth() + amount);
  else d.setUTCFullYear(d.getUTCFullYear() + amount);
  return d.toISOString();
}

export function scalarsOf(value: FilterValue | undefined): FilterScalar[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// The comparable form of a date cell: its start, cut to the day unless `withTime`.
export function dateKey(v: unknown, withTime: boolean): string | null {
  if (typeof v !== "string" || v === "") return null;
  const start = v.split("/")[0]!;
  return withTime ? start : start.slice(0, 10);
}

const hasTime = (v: unknown) => typeof v === "string" && v.length > 10;

// ---- Computed cells (relations, rollups, formulas)

export type Computed = Map<string, Value>;

function relatedOf(row: RowDoc, p: PropertyLike, ctx: ViewContext): RowDoc[] {
  const ids = cellValue(row, p);
  if (!Array.isArray(ids)) return [];
  return ids.flatMap((id) => {
    const doc = ctx.related.get(id as string);
    return doc ? [doc] : [];
  });
}

export function rollupValue(row: RowDoc, p: PropertyLike, ctx: ViewContext): Value {
  const config = p.config.rollup;
  if (!config) return null;
  const relation = ctx.properties.find((x) => x.id === config.relationPropertyId);
  if (!relation) return null;
  const docs = relatedOf(row, relation, ctx);
  if (config.function === "count") return docs.length;
  const target = ctx.targets.get(config.targetPropertyId);
  if (!target) return null;
  const values = docs.map((d) => cellValue(d, target) as Value);
  const flat = values.flatMap((v) => (Array.isArray(v) ? v : empty(v) ? [] : [v]));
  const numbers = flat.filter((v): v is number => typeof v === "number");
  const n = docs.length;
  const ratio = (k: number) => (n === 0 ? null : k / n);
  const textOf = (x: Value) =>
    typeof x === "object" && x !== null ? JSON.stringify(x) : String(x);
  const sorted = [...flat].sort((a, b) =>
    textOf(a) < textOf(b) ? -1 : textOf(a) > textOf(b) ? 1 : 0,
  );
  switch (config.function) {
    case "showOriginal":
      return flat;
    case "showUnique":
      return [...new Set(flat.map(String))];
    case "countValues":
      return flat.length;
    case "countUnique":
      return new Set(flat.map(String)).size;
    case "countEmpty":
      return values.filter(empty).length;
    case "countNotEmpty":
      return values.filter((v) => !empty(v)).length;
    case "percentEmpty":
      return ratio(values.filter(empty).length);
    case "percentNotEmpty":
      return ratio(values.filter((v) => !empty(v)).length);
    case "sum":
      return numbers.reduce((a, b) => a + b, 0);
    case "average":
      return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
    case "median": {
      if (!numbers.length) return null;
      const s = [...numbers].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
    }
    case "min":
      return numbers.length ? Math.min(...numbers) : null;
    case "max":
      return numbers.length ? Math.max(...numbers) : null;
    case "range": {
      if (DATES.has(target.type)) {
        const days = flat
          .map((v) => parseDate(textOf(v))?.ms)
          .filter((x): x is number => x !== undefined);
        return days.length
          ? Math.round((Math.max(...days) - Math.min(...days)) / 86_400_000)
          : null;
      }
      return numbers.length ? Math.max(...numbers) - Math.min(...numbers) : null;
    }
    case "earliest":
      return sorted[0] ?? null;
    case "latest":
      return sorted.at(-1) ?? null;
    case "checked":
      return values.filter((v) => v === true).length;
    case "unchecked":
      return values.filter((v) => v !== true).length;
    case "percentChecked":
      return ratio(values.filter((v) => v === true).length);
    case "percentUnchecked":
      return ratio(values.filter((v) => v !== true).length);
  }
}

const parsed = new Map<string, Expr | null>();
function parseCached(source: string): Expr | null {
  let e = parsed.get(source);
  if (e === undefined) {
    try {
      e = parseExpression(source);
    } catch {
      e = null;
    }
    if (parsed.size > 2000) parsed.clear();
    parsed.set(source, e);
  }
  return e;
}

// A Bases scope over one row: note properties typed by the schema, file.*, formula.*.
export function rowScope(row: RowDoc, ctx: ViewContext): Scope {
  const byKey = new Map<string, PropertyLike>();
  const formulas = new Map<string, PropertyLike>();
  for (const p of ctx.properties) {
    if (
      p.type === "formula" ||
      p.type === "rollup" ||
      p.type === "createdBy" ||
      p.type === "updatedBy"
    ) {
      formulas.set(p.key, p);
    } else if (p.type !== "title" && p.type !== "createdTime" && p.type !== "updatedTime") {
      byKey.set(p.key, p);
    }
  }
  const computing = new Set<string>();
  const scope: Scope = {
    now: ctx.now,
    today: ctx.today,
    note(name) {
      const p = byKey.get(name);
      const raw = row.properties[name];
      if (!p) return (raw ?? null) as Value;
      const v = cellValue(row, p);
      if (p.type === "date") return typeof v === "string" ? parseDate(v) : null;
      if (p.type === "relation") {
        return relatedOf(row, p, ctx).map((d) => new LinkValue(d.id, d.title));
      }
      return (v ?? null) as Value;
    },
    file(name) {
      switch (name) {
        case "name":
        case "basename":
          return row.title;
        case "ctime":
          return parseDate(row.createdAt);
        case "mtime":
          return parseDate(row.updatedAt);
        case "properties":
          return row.properties as Value;
        case "tags": {
          const tags = row.properties.tags;
          return Array.isArray(tags) ? (tags as Value[]) : [];
        }
        default:
          return null;
      }
    },
    formula(name) {
      const p = formulas.get(name);
      if (!p) return null;
      if (p.type === "createdBy") return row.createdBy ?? null;
      if (p.type === "updatedBy") return row.updatedBy ?? null;
      if (p.type === "rollup") return rollupValue(row, p, ctx);
      if (computing.has(name)) throw new EvalError(`Formula "${name}" refers to itself`);
      const e = parseCached(p.config.expression ?? "");
      if (!e) return null;
      computing.add(name);
      try {
        return evaluate(e, scope);
      } finally {
        computing.delete(name);
      }
    },
  };
  return scope;
}

export function formulaValue(
  row: RowDoc,
  p: PropertyLike,
  ctx: ViewContext,
  scope = rowScope(row, ctx),
): Value {
  try {
    return scope.formula(p.key);
  } catch {
    return null;
  }
}

// Relation targets with titles, rollup and formula results for one row (JSON-safe).
export function computeCells(row: RowDoc, ctx: ViewContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let scope: Scope | undefined;
  for (const p of ctx.properties) {
    if (p.type === "relation") {
      out[p.id] = relatedOf(row, p, ctx).map((d): RelatedRow => ({ id: d.id, title: d.title }));
    } else if (p.type === "rollup") {
      out[p.id] = toJson(rollupValue(row, p, ctx));
    } else if (p.type === "formula") {
      out[p.id] = toJson(formulaValue(row, p, ctx, (scope ??= rowScope(row, ctx))));
    }
  }
  return out;
}

// The value a filter, sort or group reads: stored/column values as they are, computed ones
// evaluated (as plain JSON).
function readValue(row: RowDoc, p: PropertyLike, ctx: ViewContext): unknown {
  if (p.type === "rollup") return toJson(rollupValue(row, p, ctx));
  if (p.type === "formula") return toJson(formulaValue(row, p, ctx));
  return cellValue(row, p);
}

// ---- Filters

// A filter value as the number a number or uniqueId cell is compared with: unique ids may be
// written as the property shows them ("LYD-12"). NaN matches nothing.
export function filterNumber(p: PropertyLike, x: unknown): number {
  if (typeof x === "number") return x;
  if (p.type === "uniqueId") {
    return typeof x === "string" ? (parseUniqueId(x, p.config.prefix) ?? Number.NaN) : Number.NaN;
  }
  return Number(x);
}

export function matchCondition(
  row: RowDoc,
  p: PropertyLike,
  op: string,
  value: FilterValue | undefined,
  ctx: ViewContext,
): boolean {
  const v = readValue(row, p, ctx);
  const targets = scalarsOf(value).map((s) => resolveScalar(s, ctx));
  const first = targets[0];
  if (op === "isEmpty") return empty(v);
  if (op === "isNotEmpty") return !empty(v);
  if (op === "neq") return !matchCondition(row, p, "eq", value, ctx);
  if (op === "notContains") return !matchCondition(row, p, "contains", value, ctx);
  if (op === "notIn") return !matchCondition(row, p, "in", value, ctx);
  if (first === undefined || first === null) return false;

  if (LIST.has(p.type) || Array.isArray(v)) {
    const items = Array.isArray(v)
      ? v.map((x) => (typeof x === "object" && x ? ((x as RelatedRow).id ?? String(x)) : String(x)))
      : [];
    if (op === "contains" || op === "eq") return items.includes(String(first));
    if (op === "in") return targets.some((t) => t !== null && items.includes(String(t)));
    return false;
  }
  if (p.type === "checkbox") return op === "eq" ? (v === true) === (first === true) : false;
  if (DATES.has(p.type)) {
    const withTime = hasTime(first);
    const k = dateKey(v, withTime);
    if (k === null) return false;
    const t = (x: unknown) => (typeof x === "string" ? (withTime ? x : x.slice(0, 10)) : String(x));
    switch (op) {
      case "eq":
        return k === t(first);
      case "lt":
        return k < t(first);
      case "lte":
        return k <= t(first);
      case "gt":
        return k > t(first);
      case "gte":
        return k >= t(first);
      case "between": {
        const second = targets[1];
        return second !== undefined && second !== null && k >= t(first) && k <= t(second);
      }
      default:
        return false;
    }
  }
  if (v === null || v === undefined) return false;
  const computed = p.type === "formula" || p.type === "rollup";
  if (p.type === "number" || p.type === "uniqueId" || (computed && typeof v === "number")) {
    // A number property only matches numbers (a hand-written "12" in a file does not).
    if (typeof v !== "number") return false;
    const n = v;
    const num = (x: unknown) => filterNumber(p, x);
    switch (op) {
      case "eq":
        return n === num(first);
      case "lt":
        return n < num(first);
      case "lte":
        return n <= num(first);
      case "gt":
        return n > num(first);
      case "gte":
        return n >= num(first);
      case "between": {
        const second = targets[1];
        return second !== undefined && second !== null && n >= num(first) && n <= num(second);
      }
      case "in":
        return targets.some((t) => num(t) === n);
      default:
        break;
    }
  }
  const s =
    typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v as number);
  const lower = asciiLower(s);
  switch (op) {
    case "eq":
      return s === String(first);
    case "in":
      return targets.some((t) => t !== null && s === String(t));
    case "contains":
      return lower.includes(asciiLower(String(first)));
    case "startsWith":
      return lower.startsWith(asciiLower(String(first)));
    case "endsWith":
      return lower.endsWith(asciiLower(String(first)));
    case "lt":
      return s < String(first);
    case "lte":
      return s <= String(first);
    case "gt":
      return s > String(first);
    case "gte":
      return s >= String(first);
    default:
      return false;
  }
}

export function matchFilter(row: RowDoc, node: FilterNode, ctx: ViewContext): boolean {
  switch (node.type) {
    case "group": {
      if (node.combinator === "and") return node.children.every((c) => matchFilter(row, c, ctx));
      if (node.combinator === "or") {
        return node.children.length === 0 || node.children.some((c) => matchFilter(row, c, ctx));
      }
      return !node.children.some((c) => matchFilter(row, c, ctx));
    }
    case "condition": {
      const p = ctx.properties.find((x) => x.id === node.propertyId);
      // A condition on a deleted property is ignored, as Notion does.
      return p ? matchCondition(row, p, node.op, node.value, ctx) : true;
    }
    case "expression": {
      const e = parseCached(node.expression);
      // A statement Lydie cannot parse is ignored rather than hiding every row.
      if (!e) return true;
      try {
        return truthy(evaluate(e, rowScope(row, ctx)));
      } catch {
        return false;
      }
    }
  }
}

// ---- Sorting and grouping

export type Rank = [number, number | string];

const optionIndex = (p: PropertyLike, name: unknown) => {
  const options = p.config.options ?? [];
  const i = options.findIndex((o) => o.name === name);
  return i === -1 ? options.length : i;
};

// [empty, key]: empty values sort last in both directions.
export function sortRank(row: RowDoc, p: PropertyLike, ctx: ViewContext): Rank {
  const v = readValue(row, p, ctx);
  if (p.type === "checkbox") return [0, v === true ? 1 : 0];
  if (empty(v)) return [1, 0];
  switch (p.type) {
    case "select":
    case "status":
      return [0, optionIndex(p, v)];
    case "multiSelect":
      return [0, optionIndex(p, (v as string[])[0])];
    case "person":
    case "files":
    case "relation":
      return [0, (v as unknown[]).length];
    case "number":
    case "uniqueId":
      return typeof v === "number" ? [0, v] : [1, 0];
    default:
      if (TEXT.has(p.type)) return [0, asciiLower(String(v))];
      if (DATES.has(p.type)) return [0, String(v)];
      // Formulas and rollups.
      if (typeof v === "number") return [0, v];
      if (typeof v === "boolean") return [0, v ? 1 : 0];
      if (Array.isArray(v)) return [0, v.length];
      return [0, asciiLower(String(v))];
  }
}

const cmp = (a: number | string, b: number | string) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a) < String(b)
      ? -1
      : String(a) > String(b)
        ? 1
        : 0;

function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function bucketOf(value: string, bucket: DateBucket): string {
  const day = value.split("/")[0]!.slice(0, 10);
  switch (bucket) {
    case "day":
      return day;
    case "week":
      return weekStart(day);
    case "year":
      return day.slice(0, 4);
    default:
      return day.slice(0, 7);
  }
}

// The group keys of a row (several for list values; [null] for no value).
export function groupKeys(row: RowDoc, g: GroupBy, p: PropertyLike, ctx: ViewContext): GroupKey[] {
  const v = readValue(row, p, ctx);
  if (p.type === "checkbox") return [v === true ? "true" : "false"];
  if (empty(v)) return [null];
  if (Array.isArray(v)) {
    const keys = [
      ...new Set(
        v.map((x) => (typeof x === "object" && x ? String((x as RelatedRow).id) : String(x))),
      ),
    ];
    return keys.length > 0 ? keys : [null];
  }
  if (DATES.has(p.type) && typeof v === "string") return [bucketOf(v, g.dateBucket ?? "month")];
  if (typeof v === "number") return [String(v)];
  if (typeof v === "object") return [JSON.stringify(v)];
  return [String(v as string | boolean)];
}

// Order of a group key: [tier, key] with tier 0 for values, 1 for select values that are not an
// option, 2 for no value. Returns null for keys an explicit order hides.
export function groupRank(key: GroupKey, g: GroupBy, p: PropertyLike): Rank | null {
  if (g.order) {
    const i = g.order.indexOf(key);
    return i === -1 ? null : [0, i];
  }
  if (key === null) return [2, 0];
  if (p.type === "select" || p.type === "status" || p.type === "multiSelect") {
    const i = optionIndex(p, key);
    return i === (p.config.options ?? []).length ? [1, key] : [0, i];
  }
  if (p.type === "checkbox") return [0, key === "true" ? 1 : 0];
  if (p.type === "number" || p.type === "uniqueId") return [0, Number(key)];
  return [0, asciiLower(key)];
}

// Direction applies within a tier; an explicit order is never reversed.
export function groupCmp(a: Rank, b: Rank, g: GroupBy | null): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  const c = cmp(a[1], b[1]);
  return g && !g.order && g.direction === "desc" ? -c : c;
}

// Every group to show: those with rows plus, for select/status, the empty options (unless
// hideEmpty) and keys listed in an explicit order.
export function allGroupKeys(g: GroupBy, p: PropertyLike, present: Iterable<GroupKey>): GroupKey[] {
  const keys = new Set<GroupKey>(present);
  if (!g.hideEmpty) {
    if (g.order) for (const k of g.order) keys.add(k);
    else if (p.type === "select" || p.type === "status" || p.type === "multiSelect") {
      for (const o of p.config.options ?? []) keys.add(o.name);
    } else if (p.type === "checkbox") {
      keys.add("false");
      keys.add("true");
    }
  }
  return [...keys]
    .map((k) => ({ k, r: groupRank(k, g, p) }))
    .filter((x): x is { k: GroupKey; r: Rank } => x.r !== null)
    .sort((a, b) => groupCmp(a.r, b.r, g))
    .map((x) => x.k);
}

// ---- The view

// `database.templateIds`: row templates, left out of every view (rows, counts, groups) (LYD-209).
export type ViewSpec = {
  config: ViewConfig;
  database?: (Pick<DatabaseConfig, "filter"> & { templateIds?: readonly string[] }) | null;
};

type Entry = { row: RowDoc; g: GroupKey; sg: GroupKey };

export function runView(
  rows: readonly RowDoc[],
  spec: ViewSpec,
  window: ViewWindow,
  ctx: ViewContext,
): ViewResult {
  const { config } = spec;
  const prop = (id: string | undefined) => ctx.properties.find((p) => p.id === id);
  const filters = [spec.database?.filter, config.filter].filter((f): f is FilterNode => !!f);
  const templates = new Set(spec.database?.templateIds ?? []);
  let matching = rows.filter(
    (row) => !templates.has(row.id) && filters.every((f) => matchFilter(row, f, ctx)),
  );

  const gp = config.groupBy ? prop(config.groupBy.propertyId) : undefined;
  const sgp = config.subGroupBy ? prop(config.subGroupBy.propertyId) : undefined;
  const sorts = config.sorts.flatMap((s) => {
    const p = prop(s.propertyId);
    return p ? [{ p, desc: s.direction === "desc" }] : [];
  });

  // Sort ranks are computed once per row.
  const ranks = new Map<string, Rank[]>();
  for (const row of matching)
    ranks.set(
      row.id,
      sorts.map((s) => sortRank(row, s.p, ctx)),
    );
  const byRow = (a: RowDoc, b: RowDoc) => {
    const ra = ranks.get(a.id)!;
    const rb = ranks.get(b.id)!;
    for (let i = 0; i < sorts.length; i++) {
      const x = ra[i]!;
      const y = rb[i]!;
      if (x[0] !== y[0]) return x[0] - y[0];
      const c = cmp(x[1], y[1]);
      if (c !== 0) return sorts[i]!.desc ? -c : c;
    }
    return a.sortKey < b.sortKey
      ? -1
      : a.sortKey > b.sortKey
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0;
  };

  let entries: (Entry & { gr: Rank; sgr: Rank })[] = [];
  for (const row of matching) {
    const gs = gp && config.groupBy ? groupKeys(row, config.groupBy, gp, ctx) : [null];
    const sgs = sgp && config.subGroupBy ? groupKeys(row, config.subGroupBy, sgp, ctx) : [null];
    for (const g of gs) {
      const gr = gp && config.groupBy ? groupRank(g, config.groupBy, gp) : ([0, 0] as Rank);
      if (!gr) continue;
      for (const sg of sgs) {
        const sgr =
          sgp && config.subGroupBy ? groupRank(sg, config.subGroupBy, sgp) : ([0, 0] as Rank);
        if (!sgr) continue;
        entries.push({ row, g, sg, gr, sgr });
      }
    }
  }
  entries.sort(
    (a, b) =>
      groupCmp(a.sgr, b.sgr, config.subGroupBy) ||
      groupCmp(a.gr, b.gr, config.groupBy) ||
      byRow(a.row, b.row),
  );
  if (config.limit !== null) entries = entries.slice(0, config.limit);
  matching = [];

  // Group headers with counts and start positions.
  const counts = new Map<string, number>();
  for (const e of entries)
    counts.set(countKey(e.sg, e.g), (counts.get(countKey(e.sg, e.g)) ?? 0) + 1);
  const groups = groupList(config, gp, sgp, counts);

  let selected = entries;
  if (window.group !== undefined) selected = selected.filter((e) => e.g === window.group);
  if (window.subGroup !== undefined) selected = selected.filter((e) => e.sg === window.subGroup);
  if (window.range) {
    const rp = prop(window.range.propertyId ?? config.layout.calendarPropertyId);
    const { start, end } = window.range;
    selected = rp
      ? selected.filter((e) => {
          const v = cellValue(e.row, rp);
          if (typeof v !== "string" || v === "") return false;
          const [from, to] = v.split("/");
          const s = from!.slice(0, 10);
          const t = (to ?? from!).slice(0, 10);
          return s < end && t >= start;
        })
      : [];
  }
  const page = selected.slice(window.offset, window.offset + window.limit);
  return {
    total: entries.length,
    offset: window.offset,
    rows: page.map((e) => toViewRow(e.row, e.g, e.sg, ctx)),
    groups,
  };
}

export const countKey = (sg: GroupKey, g: GroupKey) => JSON.stringify([sg, g]);

// The group headers of a view: every group to show, in order, with its row count and the
// position of its first row. `counts` is keyed by countKey(subGroup, group).
export function groupList(
  config: ViewConfig,
  gp: PropertyLike | undefined,
  sgp: PropertyLike | undefined,
  counts: ReadonlyMap<string, number>,
): ViewGroup[] {
  const groups: ViewGroup[] = [];
  if (!gp || !config.groupBy) return groups;
  const present = [...counts.keys()].map((k) => JSON.parse(k) as [GroupKey, GroupKey]);
  const gKeys = allGroupKeys(
    config.groupBy,
    gp,
    present.map(([, g]) => g),
  );
  const sgKeys =
    sgp && config.subGroupBy
      ? allGroupKeys(
          config.subGroupBy,
          sgp,
          present.map(([sg]) => sg),
        )
      : [null];
  let start = 0;
  for (const sg of sgKeys) {
    for (const g of gKeys) {
      const count = counts.get(countKey(sg, g)) ?? 0;
      if (count === 0 && config.groupBy.hideEmpty) continue;
      groups.push({ key: g, subKey: sg, count, start });
      start += count;
    }
  }
  return groups;
}

export function toViewRow(
  row: RowDoc,
  group: GroupKey,
  subGroup: GroupKey,
  ctx: ViewContext,
): ViewRow {
  return {
    id: row.id,
    title: row.title,
    sortKey: row.sortKey,
    properties: row.properties,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    group,
    subGroup,
    computed: computeCells(row, ctx),
  };
}

// Properties a view reads through formulas or rollups for filtering, sorting or grouping: the
// SQL engine cannot evaluate those and falls back to `runView`.
export function needsEvaluation(spec: ViewSpec, properties: readonly PropertyLike[]): boolean {
  const computed = new Set(
    properties.filter((p) => p.type === "formula" || p.type === "rollup").map((p) => p.id),
  );
  const inFilter = (n: FilterNode | null | undefined): boolean => {
    if (!n) return false;
    if (n.type === "group") return n.children.some(inFilter);
    if (n.type === "expression") return true;
    return computed.has(n.propertyId);
  };
  const c = spec.config;
  return (
    inFilter(spec.database?.filter) ||
    inFilter(c.filter) ||
    c.sorts.some((s) => computed.has(s.propertyId)) ||
    (!!c.groupBy && computed.has(c.groupBy.propertyId)) ||
    (!!c.subGroupBy && computed.has(c.subGroupBy.propertyId))
  );
}

export { DateValue, isEmptyValue };
