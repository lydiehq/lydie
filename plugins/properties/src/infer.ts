// A page outside a database has no schema: its property types are read from the values (as
// Obsidian does), with the type the user last chose for a key as the tie-breaker.
import { convertValue, PAGE_TYPES } from "@lydie/plugin-api/databases";
import type { PropertyLike, PropertyType, PropertyValue } from "@lydie/plugin-api/databases";

const DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?(?:\/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?)?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function inferType(value: unknown, chosen?: PropertyType | null): PropertyType {
  if (value === null || value === undefined || value === "") {
    return chosen && PAGE_TYPES.includes(chosen) ? chosen : "text";
  }
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "multiSelect";
  if (typeof value === "string") {
    if (chosen === "text" || chosen === "phone") return chosen;
    if (DATE.test(value)) return "date";
    if (/^https?:\/\//i.test(value)) return "url";
    if (EMAIL.test(value)) return "email";
    return "text";
  }
  return "text";
}

// The editors' view of a page property: its key is its name.
export function pageProperty(
  key: string,
  value: unknown,
  chosen?: PropertyType | null,
): PropertyLike {
  const type = inferType(value, chosen);
  return {
    id: key,
    name: key,
    key,
    type,
    config:
      type === "date" && typeof value === "string" && value.includes("/") ? { range: true } : {},
  };
}

// The value a new page property starts with.
export function initialValue(type: PropertyType): PropertyValue {
  switch (type) {
    case "checkbox":
      return false;
    case "multiSelect":
      return [];
    default:
      return null;
  }
}

// The value after changing a page property's type.
export function retype(value: PropertyValue, from: PropertyType, to: PropertyType): PropertyValue {
  if (value === null) return initialValue(to);
  return convertValue(value, from, to) ?? initialValue(to);
}

// A key not used yet: "Property", "Property 2", …
export function freeKey(existing: readonly string[], base: string): string {
  const taken = new Set(existing.map((k) => k.toLowerCase()));
  let key = base;
  for (let i = 2; taken.has(key.toLowerCase()); i++) key = `${base} ${i}`;
  return key;
}
