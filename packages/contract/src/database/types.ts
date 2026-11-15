import type { FilterOp, PropertyType } from "./entities.ts";

const TEXT: FilterOp[] = [
  "eq",
  "neq",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
];
const ORDERED: FilterOp[] = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
  "isEmpty",
  "isNotEmpty",
];
const CHOICE: FilterOp[] = ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"];
const LIST: FilterOp[] = ["contains", "notContains", "in", "notIn", "isEmpty", "isNotEmpty"];

// Filter operators that make sense for a property type (what the filter UI offers). Dates read
// the operators as on / before / on or before / after / on or after; `in` on lists is "contains
// any of"; values may be relative dates and, for people, { me: true }.
export function operatorsFor(type: PropertyType): readonly FilterOp[] {
  switch (type) {
    case "title":
    case "text":
    case "url":
    case "email":
    case "phone":
      return TEXT;
    case "number":
    case "uniqueId":
    case "date":
    case "createdTime":
    case "updatedTime":
      return ORDERED;
    case "select":
    case "status":
    case "createdBy":
    case "updatedBy":
      return CHOICE;
    case "multiSelect":
    case "person":
    case "relation":
    case "files":
      return LIST;
    case "checkbox":
      return ["eq"];
    case "formula":
    case "rollup":
      return [...new Set([...ORDERED, ...TEXT])];
  }
}

// Types a view can group by (board columns, table groups).
export function groupable(type: PropertyType): boolean {
  return type !== "files" && type !== "rollup" && type !== "uniqueId";
}

export function sortable(type: PropertyType): boolean {
  return type !== "files";
}
