// Structured filters (what the UI edits) ⇄ Obsidian Bases filter statements (what a .base file
// holds). Conditions are written as idiomatic Bases expressions and recognised again when read;
// anything else stays a raw `expression` node.
import type {
  FilterCondition,
  FilterNode,
  FilterOp,
  FilterScalar,
  FilterValue,
  PropertyType,
  RelativeDate,
} from "./entities.ts";
import { LIST_TYPES } from "./entities.ts";
import {
  parseRefString,
  printExpression,
  refExpr,
  refOf,
  refString,
  tryParseExpression,
} from "./expression.ts";
import type { Expr, PropertyRef } from "./expression.ts";

// What filter mapping needs to know about a property.
export type RefProperty = { id: string; type: PropertyType; key: string };

// The Bases reference of a property: note.<key> for stored values, file.* for document columns,
// formula.<key> for formulas, rollups and createdBy/updatedBy.
export function propertyRef(p: Pick<RefProperty, "type" | "key">): PropertyRef {
  switch (p.type) {
    case "title":
      return { ns: "file", name: "name" };
    case "createdTime":
      return { ns: "file", name: "ctime" };
    case "updatedTime":
      return { ns: "file", name: "mtime" };
    case "formula":
    case "rollup":
    case "createdBy":
    case "updatedBy":
      return { ns: "formula", name: p.key };
    default:
      return { ns: "note", name: p.key };
  }
}

export function propertyRefString(p: Pick<RefProperty, "type" | "key">): string {
  return refString(propertyRef(p));
}

export type FilterMapping = {
  properties: readonly RefProperty[];
  // Relation values are document ids in Lydie and links in a folder: `link("Path/Title")`.
  linkFor?: (id: string) => string | null;
  idFor?: (link: string) => string | null;
};

// Written for "the signed-in user"; Obsidian has no such notion, so it is a plain string there.
export const ME_TOKEN = "@me";

const UNITS: Record<NonNullable<RelativeDate["unit"]>, string> = {
  minute: "m",
  hour: "h",
  day: "d",
  week: "w",
  month: "M",
  year: "y",
};

const lit = (value: string | number | boolean | null): Expr => ({ kind: "literal", value });
const call = (callee: Expr, name: string, args: Expr[]): Expr => ({
  kind: "call",
  callee: { kind: "member", object: callee, property: name },
  args,
});
const fn = (name: string, args: Expr[]): Expr => ({
  kind: "call",
  callee: { kind: "ident", name },
  args,
});
const not = (arg: Expr): Expr => ({ kind: "unary", op: "!", arg });
const bin = (op: Extract<Expr, { kind: "binary" }>["op"], left: Expr, right: Expr): Expr => ({
  kind: "binary",
  op,
  left,
  right,
});

const isDateType = (t: PropertyType) => t === "date" || t === "createdTime" || t === "updatedTime";

function valueExpr(value: FilterScalar, p: RefProperty, mapping: FilterMapping): Expr {
  if (typeof value === "object") {
    if ("me" in value) return lit(ME_TOKEN);
    const base = fn(value.relative, []);
    if (!value.amount || !value.unit) return base;
    const duration = lit(`${Math.abs(value.amount)}${UNITS[value.unit]}`);
    return bin(value.amount < 0 ? "-" : "+", base, duration);
  }
  if (isDateType(p.type) && typeof value === "string") return fn("date", [lit(value)]);
  if (p.type === "relation" && typeof value === "string") {
    return fn("link", [lit(mapping.linkFor?.(value) ?? value)]);
  }
  return lit(value);
}

function scalars(value: FilterValue | undefined): FilterScalar[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function conditionExpr(c: FilterCondition, mapping: FilterMapping): Expr | null {
  const p = mapping.properties.find((x) => x.id === c.propertyId);
  if (!p) return null;
  const x = refExpr(propertyRef(p));
  // Dates compare at day level unless the value carries a time (relative "now").
  const lhs = isDateType(p.type) && !isNowValue(c.value) ? call(x, "date", []) : x;
  const v = (value: FilterScalar) => valueExpr(value, p, mapping);
  const first = scalars(c.value)[0];
  const list = LIST_TYPES.includes(p.type);
  switch (c.op) {
    case "isEmpty":
      return call(x, "isEmpty", []);
    case "isNotEmpty":
      return not(call(x, "isEmpty", []));
    case "eq":
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      if (first === undefined) return null;
      const op = { eq: "==", neq: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=" } as const;
      return bin(op[c.op], lhs, v(first));
    }
    case "between": {
      const [a, b] = scalars(c.value);
      if (a === undefined || b === undefined) return null;
      return bin("&&", bin(">=", lhs, v(a)), bin("<=", lhs, v(b)));
    }
    case "contains":
    case "notContains": {
      if (first === undefined) return null;
      const e = call(x, "contains", [v(first)]);
      return c.op === "contains" ? e : not(e);
    }
    case "startsWith":
    case "endsWith":
      if (first === undefined) return null;
      return call(x, c.op, [v(first)]);
    case "in":
    case "notIn": {
      const values = scalars(c.value).map(v);
      const e = list
        ? call(x, "containsAny", values)
        : call({ kind: "list", items: values }, "contains", [x]);
      return c.op === "in" ? e : not(e);
    }
  }
}

function isNowValue(value: FilterValue | undefined): boolean {
  return scalars(value).some(
    (s) => typeof s === "object" && "relative" in s && s.relative === "now",
  );
}

// Bases YAML for a filter: a statement string, or { and | or | not: [...] }.
export type BaseFilter = string | { and?: BaseFilter[]; or?: BaseFilter[]; not?: BaseFilter[] };

export function toBaseFilter(node: FilterNode, mapping: FilterMapping): BaseFilter | null {
  if (node.type === "expression") return node.expression;
  if (node.type === "condition") {
    const e = conditionExpr(node, mapping);
    return e ? printExpression(e) : null;
  }
  const children = node.children
    .map((c) => toBaseFilter(c, mapping))
    .filter((c): c is BaseFilter => c !== null);
  return { [node.combinator]: children };
}

// A top-level filter is always written as a group, as Obsidian does.
export function toBaseFilterRoot(node: FilterNode, mapping: FilterMapping): BaseFilter | null {
  const out = toBaseFilter(node, mapping);
  if (out === null || typeof out !== "string") return out;
  return { and: [out] };
}

// ---- Reading

export function fromBaseFilter(value: unknown, mapping: FilterMapping): FilterNode | null {
  if (typeof value === "string") return statementNode(value, mapping);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const combinator of ["and", "or", "not"] as const) {
    const list = record[combinator];
    if (list === undefined) continue;
    const items = Array.isArray(list) ? list : [list];
    const children = items
      .map((item) => fromBaseFilter(item, mapping))
      .filter((n): n is FilterNode => n !== null);
    return { type: "group", combinator, children };
  }
  return null;
}

function statementNode(statement: string, mapping: FilterMapping): FilterNode {
  const e = tryParseExpression(statement);
  const condition = e ? exprCondition(e, mapping) : null;
  return condition ?? { type: "expression", expression: statement };
}

function findProperty(e: Expr, mapping: FilterMapping): RefProperty | null {
  // `x.date()` reads the date of x.
  const target =
    e.kind === "call" &&
    e.args.length === 0 &&
    e.callee.kind === "member" &&
    e.callee.property === "date"
      ? e.callee.object
      : e;
  const ref = refOf(target);
  if (!ref) return null;
  const wanted = refString(ref);
  return mapping.properties.find((p) => propertyRefString(p) === wanted) ?? null;
}

const DURATION = /^(\d+)\s*(m|h|d|w|M|y)$/;

function scalarOf(e: Expr, p: RefProperty, mapping: FilterMapping): FilterScalar | undefined {
  if (e.kind === "literal") {
    if (e.value === null) return undefined;
    if (e.value === ME_TOKEN) return { me: true };
    return e.value;
  }
  if (e.kind === "call" && e.callee.kind === "ident") {
    const name = e.callee.name;
    const arg = e.args[0];
    if (name === "date" && arg?.kind === "literal" && typeof arg.value === "string") {
      return arg.value;
    }
    if (name === "link" && arg?.kind === "literal" && typeof arg.value === "string") {
      return mapping.idFor?.(arg.value) ?? arg.value;
    }
    if ((name === "today" || name === "now") && e.args.length === 0) return { relative: name };
  }
  if (
    e.kind === "binary" &&
    (e.op === "+" || e.op === "-") &&
    e.left.kind === "call" &&
    e.left.callee.kind === "ident" &&
    (e.left.callee.name === "today" || e.left.callee.name === "now") &&
    e.right.kind === "literal" &&
    typeof e.right.value === "string"
  ) {
    const m = DURATION.exec(e.right.value.trim());
    if (!m) return undefined;
    const unit = Object.entries(UNITS).find(([, u]) => u === m[2])?.[0] as RelativeDate["unit"];
    const amount = Number(m[1]) * (e.op === "-" ? -1 : 1);
    return { relative: e.left.callee.name, amount, unit };
  }
  void p;
  return undefined;
}

const COMPARISONS: Record<string, FilterOp> = {
  "==": "eq",
  "!=": "neq",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
};

// Recognises the statements `conditionExpr` writes (and their obvious hand-written forms).
export function exprCondition(e: Expr, mapping: FilterMapping): FilterCondition | null {
  const cond = (propertyId: string, op: FilterOp, value?: FilterValue): FilterCondition =>
    value === undefined
      ? { type: "condition", propertyId, op }
      : { type: "condition", propertyId, op, value };
  if (e.kind === "unary" && e.op === "!") {
    const inner = exprCondition(e.arg, mapping);
    if (!inner) return null;
    const negated: Partial<Record<FilterOp, FilterOp>> = {
      isEmpty: "isNotEmpty",
      contains: "notContains",
      in: "notIn",
    };
    const op = negated[inner.op];
    return op ? { ...inner, op } : null;
  }
  if (e.kind === "binary" && e.op in COMPARISONS) {
    const p = findProperty(e.left, mapping);
    if (!p) return null;
    const value = scalarOf(e.right, p, mapping);
    if (value === undefined) return null;
    return cond(p.id, COMPARISONS[e.op]!, value);
  }
  if (e.kind === "binary" && e.op === "&&") {
    const a = exprCondition(e.left, mapping);
    const b = exprCondition(e.right, mapping);
    if (a && b && a.propertyId === b.propertyId && a.op === "gte" && b.op === "lte") {
      return cond(a.propertyId, "between", [a.value as FilterScalar, b.value as FilterScalar]);
    }
    return null;
  }
  if (e.kind === "call" && e.callee.kind === "member") {
    const method = e.callee.property;
    const object = e.callee.object;
    if (method === "contains" && object.kind === "list" && e.args.length === 1) {
      const p = findProperty(e.args[0]!, mapping);
      if (!p) return null;
      const values = object.items.map((i) => scalarOf(i, p, mapping));
      if (values.some((v) => v === undefined)) return null;
      return cond(p.id, "in", values as FilterScalar[]);
    }
    const p = findProperty(object, mapping);
    if (!p) return null;
    const args = e.args.map((a) => scalarOf(a, p, mapping));
    if (args.some((a) => a === undefined)) return null;
    const values = args as FilterScalar[];
    if (method === "isEmpty" && values.length === 0) return cond(p.id, "isEmpty");
    if (method === "containsAny" && values.length > 0) return cond(p.id, "in", values);
    if (
      (method === "contains" || method === "startsWith" || method === "endsWith") &&
      values.length === 1
    ) {
      return cond(p.id, method, values[0]);
    }
  }
  return null;
}

export { parseRefString };
