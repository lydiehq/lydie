// Database views in SQL. Compiles a view (filter tree, sorts, grouping, window) into one statement
// over `doc_props` (documents with JSONB properties, see derived.ts), with the semantics of
// @lydie/runtime's JavaScript engine (`runView`); parity.test.ts checks they agree.
//
// What runs where:
// - SQL: filters, sorts, grouping (incl. exploding list values), group counts, the window, and
//   calendar ranges, for every stored type and the document columns.
// - JavaScript, over the window only: relation titles, rollups and formulas, after one batched
//   read of the related rows (never one query per row).
// - JavaScript over all rows: views that filter, sort or group by a formula or rollup, or use a
//   raw Bases expression filter (`needsEvaluation`). Measured in the bench.
import type {
  DatabaseProperty,
  FilterNode,
  FilterValue,
  GroupBy,
  GroupKey,
  ViewResult,
  ViewRow,
} from "@lydie/contract";
import {
  computeCells,
  countKey,
  filterNumber,
  groupList,
  needsEvaluation,
  resolveScalar,
  runView,
  scalarsOf,
} from "@lydie/runtime";
import type { RowDoc, ViewContext, ViewQuery } from "@lydie/runtime";

type Row = Record<string, unknown>;
export type Read = (sql: string, params: unknown[]) => Promise<Row[]>;

// A piece of SQL and its positional parameters.
type Frag = { s: string; p: unknown[] };
type Part = Frag | string | number | boolean | null;
const isFrag = (x: unknown): x is Frag =>
  typeof x === "object" && x !== null && "s" in x && "p" in x;

// sql`a = ${value}`: values become parameters, fragments are spliced in.
function sql(strings: TemplateStringsArray, ...parts: Part[]): Frag {
  let s = strings[0]!;
  const p: unknown[] = [];
  parts.forEach((part, i) => {
    if (isFrag(part)) {
      s += part.s;
      p.push(...part.p);
    } else {
      s += "?";
      p.push(part);
    }
    s += strings[i + 1]!;
  });
  return { s, p };
}
const raw = (s: string): Frag => ({ s, p: [] });
function join(parts: readonly Frag[], sep: string): Frag {
  return { s: parts.map((x) => x.s).join(sep), p: parts.flatMap((x) => x.p) };
}

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
const COLUMNS: Record<string, string> = {
  title: "d.title",
  createdTime: "d.created_at",
  updatedTime: "d.updated_at",
  createdBy: "d.created_by",
  updatedBy: "d.updated_by",
};

// JSON path of a frontmatter key (double quotes cannot be expressed in a SQLite JSON path).
const pathOf = (key: string) => `$."${key.replace(/["\\]/g, "")}"`;

// The scalar value of a property (stored or column), as SQLite reads it.
function value(p: DatabaseProperty): Frag {
  const column = COLUMNS[p.type];
  return column ? raw(column) : sql`(d.props ->> ${pathOf(p.key)})`;
}
const items = (p: DatabaseProperty) => sql`json_each(d.props, ${pathOf(p.key)})`;
const text = (p: DatabaseProperty, v: Frag = value(p)) => sql`CAST(${v} AS TEXT)`;
const isTrue = (p: DatabaseProperty) => sql`(json_type(d.props, ${pathOf(p.key)}) IS 'true')`;

function emptiness(p: DatabaseProperty, v: Frag = value(p)): Frag {
  if (LIST.has(p.type)) return sql`(NOT EXISTS (SELECT 1 FROM ${items(p)}))`;
  if (p.type === "checkbox") return raw("0");
  return sql`(${v} IS NULL OR ${v} = '')`;
}

// A date cell's comparable key: its start, cut to the day unless the filter value has a time.
function dateKey(p: DatabaseProperty, withTime: boolean): Frag {
  const v = value(p);
  const start = sql`substr(${v}, 1, instr(${v} || '/', '/') - 1)`;
  const cut = withTime ? start : sql`substr(${start}, 1, 10)`;
  return sql`(CASE WHEN typeof(${v}) = 'text' AND ${v} <> '' THEN ${cut} END)`;
}

type Ctx = Pick<ViewContext, "me" | "now" | "today">;

function condition(
  p: DatabaseProperty,
  op: string,
  filterValue: FilterValue | undefined,
  ctx: Ctx,
): Frag {
  const not = (inner: Frag) => sql`(NOT coalesce(${inner}, 0))`;
  if (op === "isEmpty") return emptiness(p);
  if (op === "isNotEmpty") return sql`(NOT ${emptiness(p)})`;
  if (op === "neq") return not(condition(p, "eq", filterValue, ctx));
  if (op === "notContains") return not(condition(p, "contains", filterValue, ctx));
  if (op === "notIn") return not(condition(p, "in", filterValue, ctx));
  const targets = scalarsOf(filterValue).map((s) => resolveScalar(s, ctx));
  const first = targets[0];
  if (first === undefined || first === null) return raw("0");

  if (LIST.has(p.type)) {
    if (op === "contains" || op === "eq") {
      return sql`(EXISTS (SELECT 1 FROM ${items(p)} WHERE CAST(value AS TEXT) = ${String(first)}))`;
    }
    if (op === "in") {
      const set = targets.filter((t) => t !== null).map((t) => sql`${String(t)}`);
      if (set.length === 0) return raw("0");
      return sql`(EXISTS (SELECT 1 FROM ${items(p)} WHERE CAST(value AS TEXT) IN (${join(set, ", ")})))`;
    }
    return raw("0");
  }
  if (p.type === "checkbox")
    return op === "eq" ? sql`(${isTrue(p)} = ${first === true ? 1 : 0})` : raw("0");
  if (DATES.has(p.type)) {
    const withTime = typeof first === "string" && first.length > 10;
    const k = dateKey(p, withTime);
    const t = (x: unknown) => (typeof x === "string" ? (withTime ? x : x.slice(0, 10)) : String(x));
    const cmp = { eq: "=", lt: "<", lte: "<=", gt: ">", gte: ">=" }[op as "eq"];
    if (cmp) return sql`(${k} ${raw(cmp)} ${t(first)})`;
    if (op === "between") {
      const second = targets[1];
      if (second === undefined || second === null) return raw("0");
      return sql`(${k} >= ${t(first)} AND ${k} <= ${t(second)})`;
    }
    return raw("0");
  }
  if (p.type === "number" || p.type === "uniqueId") {
    const v = value(p);
    const numeric = sql`typeof(${v}) IN ('integer', 'real')`;
    // No number (e.g. "ABC-1" for prefix LYD) is NULL: matches nothing, as NaN in runView.
    const n = (x: unknown) => {
      const v = filterNumber(p, x);
      return Number.isNaN(v) ? null : v;
    };
    const cmp = { eq: "=", lt: "<", lte: "<=", gt: ">", gte: ">=" }[op as "eq"];
    if (cmp) return sql`(${numeric} AND ${v} ${raw(cmp)} ${n(first)})`;
    if (op === "between") {
      const second = targets[1];
      if (second === undefined || second === null) return raw("0");
      return sql`(${numeric} AND ${v} >= ${n(first)} AND ${v} <= ${n(second)})`;
    }
    if (op === "in")
      return sql`(${numeric} AND ${v} IN (${join(
        targets.map((x) => sql`${n(x)}`),
        ", ",
      )}))`;
    return raw("0");
  }
  const s = text(p);
  const needle = String(first);
  switch (op) {
    case "eq":
      return sql`(${s} = ${needle})`;
    case "in": {
      const set = targets.filter((t) => t !== null).map((t) => sql`${String(t)}`);
      return set.length ? sql`(${s} IN (${join(set, ", ")}))` : raw("0");
    }
    case "contains":
      return sql`(instr(lower(${s}), lower(${needle})) > 0)`;
    case "startsWith":
      return sql`(substr(lower(${s}), 1, length(${needle})) = lower(${needle}))`;
    case "endsWith":
      return sql`(${needle} = '' OR substr(lower(${s}), -length(${needle})) = lower(${needle}))`;
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return sql`(${s} ${raw({ lt: "<", lte: "<=", gt: ">", gte: ">=" }[op])} ${needle})`;
    default:
      return raw("0");
  }
}

function filter(node: FilterNode, properties: readonly DatabaseProperty[], ctx: Ctx): Frag {
  switch (node.type) {
    case "group": {
      const children = node.children.map((c) => filter(c, properties, ctx));
      if (node.combinator === "and")
        return children.length ? sql`(${join(children, " AND ")})` : raw("1");
      if (node.combinator === "or")
        return children.length ? sql`(${join(children, " OR ")})` : raw("1");
      return children.length ? sql`(NOT (${join(children, " OR ")}))` : raw("1");
    }
    case "condition": {
      const p = properties.find((x) => x.id === node.propertyId);
      return p ? sql`coalesce(${condition(p, node.op, node.value, ctx)}, 0)` : raw("1");
    }
    case "expression":
      // Never reached: views with expressions run in JavaScript (needsEvaluation).
      return raw("1");
  }
}

function optionCase(p: DatabaseProperty, v: Frag): Frag {
  const options = p.config.options ?? [];
  if (options.length === 0) return raw("0");
  return sql`(CASE ${v} ${join(
    options.map((o, i) => sql`WHEN ${o.name} THEN ${raw(String(i))}`),
    " ",
  )} ELSE ${raw(String(options.length))} END)`;
}

// Sorts whose [emptiness, key] depend on the property's scalar value only: the view stores that
// value once per row and derives both while ordering (no JSON reads in the sort).
const scalarSort = (p: DatabaseProperty) => !LIST.has(p.type) && p.type !== "checkbox";

// [emptiness, key] of a sort, as runView's sortRank. `v`: the value (default: read from the row).
function sortKey(p: DatabaseProperty, v: Frag = value(p)): [Frag, Frag] {
  if (p.type === "checkbox") return [raw("0"), sql`${isTrue(p)}`];
  const empty = emptiness(p, v);
  switch (p.type) {
    case "select":
    case "status":
      return [empty, optionCase(p, v)];
    case "multiSelect":
      return [
        empty,
        sql`(SELECT ${optionCase(p, raw("CAST(value AS TEXT)"))} FROM ${items(p)} ORDER BY key LIMIT 1)`,
      ];
    case "person":
    case "files":
    case "relation":
      return [empty, sql`(SELECT count(*) FROM ${items(p)})`];
    case "number":
    case "uniqueId": {
      return [
        sql`(typeof(${v}) NOT IN ('integer', 'real'))`,
        sql`(CASE WHEN typeof(${v}) IN ('integer', 'real') THEN ${v} END)`,
      ];
    }
    default:
      // Empty values tie (NULL key), as they do in runView.
      if (TEXT.has(p.type)) return [empty, sql`NULLIF(lower(${text(p, v)}), '')`];
      return [empty, sql`NULLIF(${text(p, v)}, '')`];
  }
}

// `tier` and `rank` are functions of the key alone, so the view stores the key once per row and
// derives them while ordering (no JSON reads to order groups).
type Grouping = {
  key: Frag;
  tier: (key: Frag) => Frag;
  rank: (key: Frag) => Frag;
  join: Frag | null;
};

// The group key of a row (exploding lists through a join), its tier and rank (runView's groupRank).
function grouping(g: GroupBy, p: DatabaseProperty, alias: string): Grouping {
  let key: Frag;
  let joinFrag: Frag | null = null;
  if (LIST.has(p.type)) {
    joinFrag = sql`LEFT JOIN json_each(d.props, ${pathOf(p.key)}) AS ${raw(alias)}`;
    key = raw(`CAST(${alias}.value AS TEXT)`);
  } else if (p.type === "checkbox") {
    key = sql`(CASE WHEN ${isTrue(p)} THEN 'true' ELSE 'false' END)`;
  } else if (DATES.has(p.type)) {
    const day = dateKey(p, false);
    const bucket = g.dateBucket ?? "month";
    key =
      bucket === "day"
        ? day
        : bucket === "week"
          ? sql`date(${day}, '-6 days', 'weekday 1')`
          : sql`substr(${day}, 1, ${bucket === "year" ? 4 : 7})`;
  } else {
    key = sql`NULLIF(${text(p)}, '')`;
  }
  const order = g.order;
  if (order) {
    const rank = (k: Frag) => {
      const cases = order.map((v, i) => sql`WHEN ${k} IS ${v} THEN ${raw(String(i))}`);
      return cases.length ? sql`(CASE ${join(cases, " ")} END)` : raw("NULL");
    };
    return { key, tier: () => raw("0"), rank, join: joinFrag };
  }
  if (p.type === "select" || p.type === "status" || p.type === "multiSelect") {
    const names = (p.config.options ?? []).map((o) => sql`${o.name}`);
    const known = (k: Frag) => (names.length ? sql`${k} IN (${join(names, ", ")})` : raw("0"));
    return {
      key,
      tier: (k) => sql`(CASE WHEN ${k} IS NULL THEN 2 WHEN ${known(k)} THEN 0 ELSE 1 END)`,
      rank: (k) => sql`(CASE WHEN ${known(k)} THEN ${optionCase(p, k)} ELSE ${k} END)`,
      join: joinFrag,
    };
  }
  const tier = (k: Frag) => sql`(CASE WHEN ${k} IS NULL THEN 2 ELSE 0 END)`;
  if (p.type === "checkbox") {
    return { key, tier: () => raw("0"), rank: (k) => sql`(${k} = 'true')`, join: joinFrag };
  }
  if (p.type === "number" || p.type === "uniqueId") {
    return { key, tier, rank: (k) => sql`CAST(${k} AS REAL)`, join: joinFrag };
  }
  return { key, tier, rank: (k) => sql`lower(${k})`, join: joinFrag };
}

export type CompiledView = { sql: string; params: unknown[] };

// The statement: kind 0 rows are (group, subGroup, count) for every group, kind 1 rows the window.
export function compileView(q: ViewQuery): CompiledView {
  const ctx: Ctx = { me: q.me, now: Date.parse(q.now), today: q.today };
  const c = q.config;
  const prop = (id: string | undefined) => q.properties.find((p) => p.id === id);
  const gp = c.groupBy ? prop(c.groupBy.propertyId) : undefined;
  const sgp = c.subGroupBy ? prop(c.subGroupBy.propertyId) : undefined;
  const g = gp && c.groupBy ? grouping(c.groupBy, gp, "gj") : null;
  const sg = sgp && c.subGroupBy ? grouping(c.subGroupBy, sgp, "sgj") : null;
  const sorts = c.sorts.flatMap((s) => {
    const p = prop(s.propertyId);
    return p ? [{ p, scalar: scalarSort(p), desc: s.direction === "desc" }] : [];
  });

  const where: Frag[] = [sql`d.parent_id = ${q.databaseId}`, raw("d.deleted_at IS NULL")];
  if (q.databaseFilter) where.push(filter(q.databaseFilter, q.properties, ctx));
  if (q.templateIds?.length) {
    where.push(sql`d.id NOT IN (SELECT value FROM json_each(${JSON.stringify(q.templateIds)}))`);
  }
  if (c.filter) where.push(filter(c.filter, q.properties, ctx));

  // f holds what ordering needs, each JSON value read once: the group keys (tiers and ranks are
  // derived from them) and per sort either the raw value (scalar sorts) or [emptiness, key].
  const cols: Frag[] = [
    raw("d.id AS id"),
    raw("d.sort_key AS sort_key"),
    g ? sql`${g.key} AS g` : raw("NULL AS g"),
    sg ? sql`${sg.key} AS sg` : raw("NULL AS sg"),
    ...sorts.map((s, i) => {
      const n = raw(String(i));
      if (s.scalar) return sql`${value(s.p)} AS s${n}`;
      const [empty, key] = sortKey(s.p);
      return sql`${empty} AS e${n}, ${key} AS k${n}`;
    }),
  ];
  const joins = [g?.join, sg?.join].filter((j): j is Frag => !!j);
  let inner = sql`SELECT ${join(cols, ", ")} FROM doc_props d ${join(joins, " ")} WHERE ${join(where, " AND ")}`;
  // An explicit group order hides the groups it does not list.
  const hidden: Frag[] = [];
  if (g && c.groupBy?.order) hidden.push(sql`${g.rank(raw("g"))} IS NOT NULL`);
  if (sg && c.subGroupBy?.order) hidden.push(sql`${sg.rank(raw("sg"))} IS NOT NULL`);
  if (hidden.length) inner = sql`SELECT * FROM (${inner}) WHERE ${join(hidden, " AND ")}`;

  const dir = (gb: GroupBy | null) => (gb && !gb.order && gb.direction === "desc" ? " DESC" : "");
  const order = (a: string): Frag => {
    const col = (name: string) => raw(`${a}.${name}`);
    const parts: Frag[] = [];
    if (sg) parts.push(sg.tier(col("sg")), sql`${sg.rank(col("sg"))}${raw(dir(c.subGroupBy))}`);
    if (g) parts.push(g.tier(col("g")), sql`${g.rank(col("g"))}${raw(dir(c.groupBy))}`);
    sorts.forEach((s, i) => {
      const desc = raw(s.desc ? " DESC" : "");
      const [empty, key] = s.scalar ? sortKey(s.p, col(`s${i}`)) : [col(`e${i}`), col(`k${i}`)];
      parts.push(empty, sql`${key}${desc}`);
    });
    parts.push(col("sort_key"), col("id"));
    // A constant term orders nothing, and SQLite would read a bare integer as a column number.
    return join(
      parts.filter((x) => !(x.p.length === 0 && /^\(?-?\d+\)?( DESC)?$/.test(x.s.trim()))),
      ", ",
    );
  };

  const ctes = [sql`f AS MATERIALIZED (${inner})`];
  let source = "f";
  if (c.limit !== null) {
    ctes.push(sql`o AS MATERIALIZED (SELECT * FROM f ORDER BY ${order("f")} LIMIT ${c.limit})`);
    source = "o";
  }

  const windowWhere: Frag[] = [];
  const w = q.window;
  if (w.group !== undefined) windowWhere.push(sql`${raw(source)}.g IS ${w.group}`);
  if (w.subGroup !== undefined) windowWhere.push(sql`${raw(source)}.sg IS ${w.subGroup}`);
  if (w.range) {
    const rp = prop(w.range.propertyId ?? c.layout.calendarPropertyId);
    if (!rp) windowWhere.push(raw("0"));
    else {
      const v = value(rp);
      const slash = sql`instr(${v}, '/')`;
      const start = sql`substr(${v}, 1, 10)`;
      const end = sql`substr(CASE WHEN ${slash} > 0 THEN substr(${v}, ${slash} + 1) ELSE ${v} END, 1, 10)`;
      windowWhere.push(
        sql`(typeof(${v}) = 'text' AND ${v} <> '' AND ${start} < ${w.range.end} AND ${end} >= ${w.range.start})`,
      );
    }
  }
  const nulls =
    "NULL AS id, NULL AS title, NULL AS sort_key, NULL AS props, NULL AS created_at, " +
    "NULL AS updated_at, NULL AS created_by, NULL AS updated_by";
  // The window sorts ids and keys only; the 100 rows' JSON is read after the LIMIT.
  const needsDoc = !!w.range;
  const statement = sql`WITH ${join(ctes, ", ")}
    SELECT 0 AS kind, g, sg, count(*) AS n, ${raw(nulls)} FROM ${raw(source)} GROUP BY g, sg
    UNION ALL
    SELECT * FROM (
      SELECT 1, w.g, w.sg, NULL, d.id, d.title, d.sort_key, json(d.props),
             d.created_at, d.updated_at, d.created_by, d.updated_by
      FROM (
        SELECT ${raw(source)}.* FROM ${raw(source)}
        ${needsDoc ? raw(`JOIN doc_props d ON d.id = ${source}.id`) : raw("")}
        ${windowWhere.length ? sql`WHERE ${join(windowWhere, " AND ")}` : raw("")}
        ORDER BY ${order(source)}
        LIMIT ${w.limit} OFFSET ${w.offset}
      ) w
      JOIN doc_props d ON d.id = w.id
      ORDER BY ${order("w")})`;
  return { sql: statement.s, params: statement.p };
}

const ROW_COLUMNS =
  "id, title, sort_key, json(props) AS props, created_at, updated_at, created_by, updated_by";

function toRowDoc(r: Row): RowDoc {
  return {
    id: String(r.id),
    title: String(r.title),
    sortKey: String(r.sort_key),
    properties: JSON.parse(typeof r.props === "string" ? r.props : "{}") as Record<string, unknown>,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    createdBy: (r.created_by as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
  };
}

// Live documents relations point at, in one query.
async function relatedRows(
  read: Read,
  rows: readonly RowDoc[],
  properties: readonly DatabaseProperty[],
) {
  const keys = properties.filter((p) => p.type === "relation").map((p) => p.key);
  const related = new Map<string, RowDoc>();
  if (keys.length === 0) return related;
  const ids = new Set<string>();
  for (const row of rows) {
    for (const key of keys) {
      const v = row.properties[key];
      for (const id of Array.isArray(v) ? v : typeof v === "string" ? [v] : []) ids.add(String(id));
    }
  }
  if (ids.size === 0) return related;
  const found = await read(
    `SELECT ${ROW_COLUMNS} FROM doc_props WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL`,
    [JSON.stringify([...ids])],
  );
  for (const r of found) related.set(String(r.id), toRowDoc(r));
  return related;
}

function contextOf(q: ViewQuery, related: Map<string, RowDoc>): ViewContext {
  return {
    properties: q.properties,
    related,
    targets: new Map(q.targets.map((t) => [t.id, t])),
    me: q.me,
    now: Date.parse(q.now),
    today: q.today,
  };
}

// Runs a view: SQL when it can, JavaScript over every row when the view filters, sorts or groups by
// something only JavaScript evaluates.
export async function runViewQuery(read: Read, q: ViewQuery): Promise<ViewResult> {
  const spec = {
    config: q.config,
    database: { filter: q.databaseFilter, templateIds: q.templateIds ?? [] },
  };
  if (needsEvaluation(spec, q.properties)) {
    const rows = (
      await read(
        `SELECT ${ROW_COLUMNS} FROM doc_props WHERE parent_id = ? AND deleted_at IS NULL`,
        [q.databaseId],
      )
    ).map(toRowDoc);
    return runView(rows, spec, q.window, contextOf(q, await relatedRows(read, rows, q.properties)));
  }
  const compiled = compileView(q);
  const result = await read(compiled.sql, compiled.params);
  const counts = new Map<string, number>();
  const page: { row: RowDoc; g: GroupKey; sg: GroupKey }[] = [];
  let total = 0;
  for (const r of result) {
    const g = (r.g ?? null) as GroupKey;
    const sg = (r.sg ?? null) as GroupKey;
    if (Number(r.kind) === 0) {
      counts.set(countKey(sg, g), Number(r.n));
      total += Number(r.n);
    } else page.push({ row: toRowDoc(r), g, sg });
  }
  const prop = (id: string | undefined) => q.properties.find((p) => p.id === id);
  const gp = q.config.groupBy ? prop(q.config.groupBy.propertyId) : undefined;
  const sgp = q.config.subGroupBy ? prop(q.config.subGroupBy.propertyId) : undefined;
  const ctx = contextOf(
    q,
    await relatedRows(
      read,
      page.map((e) => e.row),
      q.properties,
    ),
  );
  const rows: ViewRow[] = page.map(({ row, g, sg }) => ({
    id: row.id,
    title: row.title,
    sortKey: row.sortKey,
    properties: row.properties,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    group: gp ? g : null,
    subGroup: sgp ? sg : null,
    computed: computeCells(row, ctx),
  }));
  return { total, offset: q.window.offset, rows, groups: groupList(q.config, gp, sgp, counts) };
}
