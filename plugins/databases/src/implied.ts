// What a new page or a group move must set when the view shown is not the saved one (a personal
// filter or grouping): the same rules `database.createRow` and `database.moveRow` apply to a
// saved view (`@lydie/runtime`, handlers/database.ts), computed here for the effective view.
import { isStoredType } from "@lydie/plugin-api/databases";
import type {
  DatabaseProperty,
  FilterNode,
  GroupBy,
  GroupKey,
  PropertyValue,
} from "@lydie/plugin-api/databases";

const LISTED = new Set(["multiSelect", "person", "relation"]);

// The value that puts a page in a group.
export function groupValue(
  p: DatabaseProperty,
  key: GroupKey,
  bucket: "day" | "week" | "month" | "year" = "month",
): PropertyValue | undefined {
  if (key === null) return null;
  switch (p.type) {
    case "select":
    case "status":
    case "text":
    case "url":
    case "email":
    case "phone":
      return key;
    case "number":
      return Number.isFinite(Number(key)) ? Number(key) : undefined;
    case "checkbox":
      return key === "true";
    case "date":
      return bucket === "year" ? `${key}-01-01` : bucket === "month" ? `${key}-01` : key;
    case "multiSelect":
    case "person":
    case "relation":
      return [key];
    default:
      return undefined;
  }
}

// Values a filter implies: only conditions joined by "and" that pin one value. `me` is the user
// id for "me" conditions (skipped when unknown).
export function impliedValues(
  node: FilterNode | null,
  properties: readonly DatabaseProperty[],
  me: string | null,
  out: Record<string, PropertyValue> = {},
): Record<string, PropertyValue> {
  if (!node) return out;
  if (node.type === "group") {
    if (node.combinator === "and")
      for (const c of node.children) impliedValues(c, properties, me, out);
    return out;
  }
  if (node.type !== "condition") return out;
  const p = properties.find((x) => x.id === node.propertyId);
  // Unique ids are assigned by createRow, never implied.
  if (!p || !isStoredType(p.type) || p.type === "uniqueId") return out;
  const values =
    node.value === undefined || node.value === null
      ? []
      : Array.isArray(node.value)
        ? node.value
        : [node.value];
  const first: unknown = values[0];
  const v =
    typeof first === "object" && first !== null ? ("me" in first ? me : null) : (first ?? null);
  if (v === null) return out;
  const list = LISTED.has(p.type) || p.type === "files";
  if ((node.op === "eq" || (node.op === "in" && values.length === 1)) && !list)
    out[p.id] = v as PropertyValue;
  else if ((node.op === "contains" || (node.op === "in" && values.length === 1)) && list)
    out[p.id] = [String(v as string | number | boolean)];
  return out;
}

// The values of a new page in a group (and sub-group) of the effective view.
export function groupedValues(
  properties: readonly DatabaseProperty[],
  pairs: readonly (readonly [GroupBy | null, GroupKey | undefined])[],
  out: Record<string, PropertyValue> = {},
): Record<string, PropertyValue> {
  for (const [g, key] of pairs) {
    if (!g || key === undefined) continue;
    const p = properties.find((x) => x.id === g.propertyId);
    const v = p && isStoredType(p.type) ? groupValue(p, key, g.dateBucket) : undefined;
    if (p && v !== undefined) out[p.id] = v;
  }
  return out;
}

const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];

export type GroupMove = {
  groupBy: GroupBy | null;
  key: GroupKey | undefined;
  // The group it was in (list-valued properties keep their other values).
  from?: GroupKey | undefined;
};

// What moving a page between groups sets and unsets; null when a group is computed (cannot move).
export function groupMoveValues(
  properties: readonly DatabaseProperty[],
  rowProperties: Readonly<Record<string, unknown>>,
  moves: readonly GroupMove[],
): { set: Record<string, PropertyValue>; unset: string[] } | null {
  const set: Record<string, PropertyValue> = {};
  const unset: string[] = [];
  for (const { groupBy: g, key, from } of moves) {
    if (!g || key === undefined) continue;
    const p = properties.find((x) => x.id === g.propertyId);
    if (!p || !isStoredType(p.type)) return null;
    if (LISTED.has(p.type)) {
      const current = listOf(rowProperties[p.key]).filter((x) => x !== from);
      const next =
        key === null
          ? from === undefined
            ? []
            : current
          : [...current.filter((x) => x !== key), key];
      if (next.length > 0) set[p.id] = next;
      else unset.push(p.id);
    } else {
      const v = groupValue(p, key, g.dateBucket);
      if (v === undefined) continue;
      if (v === null) unset.push(p.id);
      else set[p.id] = v;
    }
  }
  return { set, unset };
}
