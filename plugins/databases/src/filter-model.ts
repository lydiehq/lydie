// The filter builder's model: a view filter as a root "and"/"or" group whose children are
// conditions and (up to two levels of) nested groups, edited by path. Pure functions; the UI turns
// each change into one `database.updateView`.
import { operatorsFor, parseUniqueId } from "@lydie/plugin-api/databases";
import type {
  DatabaseProperty,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterOp,
  FilterValue,
  PropertyType,
  RelativeDate,
} from "@lydie/plugin-api/databases";

export type Path = readonly number[];

// Nested groups allowed below the root (the contract's filter schema has three levels).
export const MAX_GROUP_DEPTH = 2;

export function toRoot(filter: FilterNode | null | undefined): FilterGroup {
  if (!filter) return { type: "group", combinator: "and", children: [] };
  if (filter.type === "group" && filter.combinator !== "not") return filter;
  return { type: "group", combinator: "and", children: [filter] };
}

// What gets saved: null for an empty filter, the root group otherwise.
export function fromRoot(root: FilterGroup): FilterNode | null {
  return root.children.length === 0 ? null : root;
}

export function nodeAt(root: FilterGroup, path: Path): FilterNode | null {
  let node: FilterNode = root;
  for (const i of path) {
    if (node.type !== "group") return null;
    const next: FilterNode | undefined = node.children[i];
    if (!next) return null;
    node = next;
  }
  return node;
}

function replaceAt(root: FilterGroup, path: Path, fn: (node: FilterNode) => FilterNode | null) {
  const walk = (node: FilterNode, depth: number): FilterNode | null => {
    if (depth === path.length) return fn(node);
    if (node.type !== "group") return node;
    const index = path[depth]!;
    const children: FilterNode[] = [];
    node.children.forEach((child, i) => {
      const next = i === index ? walk(child, depth + 1) : child;
      if (next) children.push(next);
    });
    return { ...node, children };
  };
  return (walk(root, 0) as FilterGroup | null) ?? toRoot(null);
}

export function addCondition(root: FilterGroup, groupPath: Path, condition: FilterCondition) {
  return replaceAt(root, groupPath, (node) =>
    node.type === "group" ? { ...node, children: [...node.children, condition] } : node,
  );
}

export function canAddGroup(groupPath: Path): boolean {
  return groupPath.length < MAX_GROUP_DEPTH;
}

export function addGroup(root: FilterGroup, groupPath: Path, condition: FilterCondition) {
  if (!canAddGroup(groupPath)) return root;
  return replaceAt(root, groupPath, (node) =>
    node.type === "group"
      ? {
          ...node,
          children: [
            ...node.children,
            {
              type: "group",
              combinator: node.combinator === "and" ? "or" : "and",
              children: [condition],
            },
          ],
        }
      : node,
  );
}

// Removes a node; a nested group left empty goes too.
export function removeAt(root: FilterGroup, path: Path): FilterGroup {
  if (path.length === 0) return toRoot(null);
  let next = replaceAt(root, path, () => null);
  for (let depth = path.length - 1; depth > 0; depth--) {
    const parent = path.slice(0, depth);
    const node = nodeAt(next, parent);
    if (node?.type === "group" && node.children.length === 0)
      next = replaceAt(next, parent, () => null);
  }
  return next;
}

export function updateCondition(
  root: FilterGroup,
  path: Path,
  patch: Partial<Omit<FilterCondition, "type">>,
): FilterGroup {
  return replaceAt(root, path, (node) => {
    if (node.type !== "condition") return node;
    const next: FilterCondition = { ...node, ...patch };
    if (!needsValue(next.op)) delete next.value;
    return next;
  });
}

export function setCombinator(root: FilterGroup, groupPath: Path, combinator: "and" | "or") {
  return replaceAt(root, groupPath, (node) =>
    node.type === "group" ? { ...node, combinator } : node,
  );
}

export function needsValue(op: FilterOp): boolean {
  return op !== "isEmpty" && op !== "isNotEmpty";
}

export function countConditions(node: FilterNode | null | undefined): number {
  if (!node) return 0;
  if (node.type === "group") return node.children.reduce((n, c) => n + countConditions(c), 0);
  return 1;
}

// A new condition on a property: its first operator and a neutral value.
export function defaultCondition(property: { id: string; type: PropertyType }): FilterCondition {
  const op = operatorsFor(property.type)[0] ?? "eq";
  if (property.type === "checkbox")
    return { type: "condition", propertyId: property.id, op, value: true };
  if (op === "isEmpty" || op === "isNotEmpty")
    return { type: "condition", propertyId: property.id, op };
  return { type: "condition", propertyId: property.id, op, value: defaultValue(property.type, op) };
}

export function defaultValue(type: PropertyType, op: FilterOp): FilterValue {
  if (op === "in" || op === "notIn") return [];
  if (op === "between")
    return [{ relative: "today" }, { relative: "today", amount: 7, unit: "day" }];
  if (type === "checkbox") return true;
  if (type === "number" || type === "uniqueId") return null;
  return "";
}

const DATE_TYPES = new Set<PropertyType>(["date", "createdTime", "updatedTime"]);
const LIST_TYPES = new Set<PropertyType>(["multiSelect", "person", "relation", "files"]);

// How an operator reads for a property type (dates read before/after, lists contain).
export function opLabel(op: FilterOp, type: PropertyType): string {
  const date = DATE_TYPES.has(type);
  switch (op) {
    case "eq":
      return type === "checkbox" ? "is" : date ? "is on" : "is";
    case "neq":
      return date ? "is not on" : "is not";
    case "contains":
      return LIST_TYPES.has(type) ? "contains" : "contains";
    case "notContains":
      return "does not contain";
    case "startsWith":
      return "starts with";
    case "endsWith":
      return "ends with";
    case "lt":
      return date ? "is before" : "<";
    case "lte":
      return date ? "is on or before" : "≤";
    case "gt":
      return date ? "is after" : ">";
    case "gte":
      return date ? "is on or after" : "≥";
    case "between":
      return "is between";
    case "in":
      return LIST_TYPES.has(type) ? "contains any of" : "is any of";
    case "notIn":
      return LIST_TYPES.has(type) ? "contains none of" : "is none of";
    case "isEmpty":
      return "is empty";
    case "isNotEmpty":
      return "is not empty";
  }
}

export const RELATIVE_DATES: readonly { label: string; value: RelativeDate }[] = [
  { label: "Today", value: { relative: "today" } },
  { label: "Tomorrow", value: { relative: "today", amount: 1, unit: "day" } },
  { label: "Yesterday", value: { relative: "today", amount: -1, unit: "day" } },
  { label: "One week ago", value: { relative: "today", amount: -1, unit: "week" } },
  { label: "One week from now", value: { relative: "today", amount: 1, unit: "week" } },
  { label: "One month ago", value: { relative: "today", amount: -1, unit: "month" } },
  { label: "One month from now", value: { relative: "today", amount: 1, unit: "month" } },
];

export function isRelativeDate(value: unknown): value is RelativeDate {
  return typeof value === "object" && value !== null && "relative" in value;
}

export function relativeLabel(value: RelativeDate): string {
  const known = RELATIVE_DATES.find(
    (r) =>
      r.value.relative === value.relative &&
      (r.value.amount ?? 0) === (value.amount ?? 0) &&
      (r.value.unit ?? "day") === (value.unit ?? "day"),
  );
  if (known) return known.label;
  const amount = value.amount ?? 0;
  if (amount === 0) return value.relative === "now" ? "Now" : "Today";
  return `${Math.abs(amount)} ${value.unit ?? "day"}${Math.abs(amount) === 1 ? "" : "s"} ${amount < 0 ? "ago" : "from now"}`;
}

// The view's filter plus a title search, keeping within the schema's nesting depth: the search
// joins a root "and" group; otherwise the filter is wrapped. Text that reads as a unique id of
// one of `uniqueIds` ("LYD-12", or "12" without a prefix) also finds that page.
export function withSearch(
  filter: FilterNode | null,
  titlePropertyId: string | null,
  search: string,
  uniqueIds: readonly Pick<DatabaseProperty, "id" | "config">[] = [],
): FilterNode | null {
  const q = search.trim();
  if (!q || !titlePropertyId) return filter;
  const title: FilterCondition = {
    type: "condition",
    propertyId: titlePropertyId,
    op: "contains",
    value: q,
  };
  const ids = uniqueIds.flatMap((p): FilterCondition[] => {
    const n = parseUniqueId(q, p.config.prefix);
    return n === null ? [] : [{ type: "condition", propertyId: p.id, op: "eq", value: n }];
  });
  const condition: FilterNode =
    ids.length > 0 ? { type: "group", combinator: "or", children: [title, ...ids] } : title;
  if (!filter) return condition;
  if (filter.type === "group" && filter.combinator === "and") {
    return { ...filter, children: [...filter.children, condition] };
  }
  if (groupDepth(filter) >= 3) return filter;
  return { type: "group", combinator: "and", children: [filter, condition] };
}

function groupDepth(node: FilterNode): number {
  if (node.type !== "group") return 0;
  return 1 + Math.max(0, ...node.children.map(groupDepth));
}
