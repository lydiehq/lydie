// Filters as chips that read as sentences ("Status · is any of · Todo, Doing"), so nothing that
// decides which pages show is hidden in a closed menu. Operators follow the
// number of values: one value reads "is", several "is any of" (`eq` ⇄ `in`). Nested and/or
// groups are the advanced builder's; the chips then show one "Advanced filter" chip. Pure.
import { formatUniqueId, operatorsFor } from "@lydie/plugin-api/databases";
import type {
  DatabaseProperty,
  FilterCondition,
  FilterNode,
  FilterOp,
  FilterValue,
  PropertyType,
} from "@lydie/plugin-api/databases";

import {
  countConditions,
  fromRoot,
  isRelativeDate,
  needsValue,
  opLabel,
  relativeLabel,
  removeAt,
  toRoot,
} from "./filter-model.ts";

export type FilterChip = {
  // Index in the root group (the path for filter-model's edits is `[index]`).
  index: number;
  condition: FilterCondition;
  property: DatabaseProperty | null;
  propertyLabel: string;
  opLabel: string;
  // Null when the operator takes no value ("is empty").
  valueLabel: string | null;
};

export type FilterChips =
  | { kind: "none" }
  | { kind: "simple"; chips: FilterChip[] }
  // Or-groups, nested groups or expressions: edited in the advanced builder.
  | { kind: "advanced"; rules: number };

export function filterChips(
  filter: FilterNode | null,
  properties: readonly DatabaseProperty[],
): FilterChips {
  if (!filter) return { kind: "none" };
  const children =
    filter.type === "group"
      ? filter.combinator === "and" || (filter.combinator === "or" && filter.children.length <= 1)
        ? filter.children
        : null
      : [filter];
  if (!children || children.some((c) => c.type !== "condition")) {
    return { kind: "advanced", rules: countConditions(filter) };
  }
  if (children.length === 0) return { kind: "none" };
  return {
    kind: "simple",
    chips: (children as FilterCondition[]).map((condition, index) =>
      chipOf(condition, index, properties),
    ),
  };
}

function chipOf(
  condition: FilterCondition,
  index: number,
  properties: readonly DatabaseProperty[],
): FilterChip {
  const property = properties.find((p) => p.id === condition.propertyId) ?? null;
  if (!property) {
    return {
      index,
      condition,
      property,
      propertyLabel: "Deleted property",
      opLabel: "",
      valueLabel: null,
    };
  }
  return {
    index,
    condition,
    property,
    propertyLabel: property.name,
    opLabel: chipOpLabel(condition, property.type),
    valueLabel: needsValue(condition.op) ? valueLabel(condition.value, property) : null,
  };
}

// ---- Edits from chips (each returns the view's new filter)

// A new condition joins the root as "and" (a lone condition under "or" becomes "and" first).
export function addChip(filter: FilterNode | null, condition: FilterCondition): FilterNode {
  const root = toRoot(filter);
  const combinator = root.children.length <= 1 ? "and" : root.combinator;
  return { ...root, combinator, children: [...root.children, condition] };
}

export function replaceChip(
  filter: FilterNode | null,
  index: number,
  condition: FilterCondition,
): FilterNode | null {
  const root = toRoot(filter);
  const next: FilterCondition = { ...condition };
  if (!needsValue(next.op)) delete next.value;
  return fromRoot({
    ...root,
    children: root.children.map((c, i) => (i === index ? next : c)),
  });
}

export function removeChip(filter: FilterNode | null, index: number): FilterNode | null {
  return fromRoot(removeAt(toRoot(filter), [index]));
}

// ---- Operators that follow the number of values

const POSITIVE = new Set<FilterOp>(["eq", "contains", "in"]);
const NEGATIVE = new Set<FilterOp>(["neq", "notContains", "notIn"]);

// Choice and list properties: "is"/"is any of" are one operator, as are "is not"/"is none of".
export function isMultiValueType(type: PropertyType): boolean {
  const ops = operatorsFor(type);
  return ops.includes("in") && ops.includes("notIn");
}

function listOps(type: PropertyType): boolean {
  return operatorsFor(type).includes("contains") && !operatorsFor(type).includes("eq");
}

export function valuesOf(condition: FilterCondition): string[] {
  const v = condition.value;
  if (v === undefined || v === null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).flatMap((x) =>
    typeof x === "string" ? (x ? [x] : []) : typeof x === "number" ? [String(x)] : [],
  );
}

// The condition with these values: one value → `eq`/`contains` (`neq`/`notContains`), several →
// `in` (`notIn`).
export function withValues(
  condition: FilterCondition,
  type: PropertyType,
  values: readonly string[],
): FilterCondition {
  const negative = NEGATIVE.has(condition.op);
  if (!POSITIVE.has(condition.op) && !negative) return condition;
  if (values.length > 1) {
    return { ...condition, op: negative ? "notIn" : "in", value: [...values] };
  }
  const single: FilterOp = listOps(type)
    ? negative
      ? "notContains"
      : "contains"
    : negative
      ? "neq"
      : "eq";
  return { ...condition, op: single, value: values[0] ?? "" };
}

export type ChipOperator = { id: string; label: string };

// The operators a chip offers. For choice and list properties the "is"/"is any of" pairs are
// one choice each.
export function chipOperators(type: PropertyType): ChipOperator[] {
  const ops = operatorsFor(type);
  if (!isMultiValueType(type)) return ops.map((op) => ({ id: op, label: opLabel(op, type) }));
  const list = listOps(type);
  return [
    { id: "positive", label: list ? "contains" : "is" },
    { id: "negative", label: list ? "does not contain" : "is not" },
    { id: "isEmpty", label: opLabel("isEmpty", type) },
    { id: "isNotEmpty", label: opLabel("isNotEmpty", type) },
  ];
}

export function chipOperatorOf(condition: FilterCondition, type: PropertyType): string {
  if (isMultiValueType(type)) {
    if (POSITIVE.has(condition.op)) return "positive";
    if (NEGATIVE.has(condition.op)) return "negative";
  }
  return condition.op;
}

// The condition after choosing a chip operator; the values stay where they still fit.
export function withChipOperator(
  condition: FilterCondition,
  type: PropertyType,
  operator: string,
  fallback: (op: FilterOp) => FilterValue,
): FilterCondition {
  if (operator === "positive" || operator === "negative") {
    const values = valuesOf(condition);
    const base: FilterCondition = { ...condition, op: operator === "positive" ? "eq" : "neq" };
    return withValues(base, type, values);
  }
  const op = operator as FilterOp;
  if (!needsValue(op)) {
    const { value: _value, ...rest } = condition;
    return { ...rest, op };
  }
  const listShaped = (o: FilterOp) => o === "in" || o === "notIn" || o === "between";
  const keep = condition.value !== undefined && listShaped(condition.op) === listShaped(op);
  return { ...condition, op, value: keep ? condition.value! : fallback(op) };
}

export function chipOpLabel(condition: FilterCondition, type: PropertyType): string {
  if (isMultiValueType(type) && (condition.op === "in" || condition.op === "notIn")) {
    const n = valuesOf(condition).length;
    const list = listOps(type);
    if (n <= 1) {
      if (condition.op === "in") return list ? "contains" : "is";
      return list ? "does not contain" : "is not";
    }
  }
  return opLabel(condition.op, type);
}

export function valueLabel(value: FilterValue | undefined, property: DatabaseProperty): string {
  const one = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? "Checked" : "Unchecked";
    if (isRelativeDate(v)) return relativeLabel(v);
    if (typeof v === "object") return "me" in v ? "Me" : "";
    if (property.type === "uniqueId" && typeof v === "number")
      return formatUniqueId(v, property.config.prefix);
    return String(v as string | number);
  };
  if (property.type === "checkbox") return value === false ? "Unchecked" : "Checked";
  if (Array.isArray(value)) {
    if (property.type === "relation") {
      return value.length === 0 ? "…" : `${value.length} page${value.length === 1 ? "" : "s"}`;
    }
    const parts = value.map(one).filter(Boolean);
    if (parts.length === 0) return "…";
    // A date range.
    if (value.length === 2 && (property.type === "date" || property.type.endsWith("Time"))) {
      return `${parts[0]} and ${parts[1] ?? ""}`;
    }
    return parts.join(", ");
  }
  if (property.type === "relation" && typeof value === "string" && value) return "1 page";
  return one(value) || "…";
}
