// Pure helpers for the collection side of the panel: which frontmatter keys a collection does not
// list, how one becomes a collection property (same key, inferred type, values untouched), and the
// catalogue of properties other collections already have.
import { isPageOptionKey, userPropertyEntries } from "@lydie/plugin-api";
import type { BackendOps } from "@lydie/plugin-api";
import { ADDABLE_TYPES, isStoredType, TYPE_LABELS } from "@lydie/plugin-api/databases";
import type {
  DatabaseDefinition,
  DatabaseProperty,
  PropertyConfig,
  PropertyType,
} from "@lydie/plugin-api/databases";

import { inferType } from "./infer.ts";

export type AddPropertyInput = Parameters<BackendOps["database"]["addProperty"]>[0];
export type NewProperty = Omit<AddPropertyInput, "databaseId">;

// Types the panel can add (relations and rollups are set up from the collection's table).
export const NEW_PROPERTY_TYPES = ADDABLE_TYPES.filter((t) => t !== "relation" && t !== "rollup");

// Keys the collection fixes for itself (title, created/edited time): a page's own value under one
// of these cannot become a collection property.
const FIXED = new Set<PropertyType>(["title", "createdTime", "updatedTime"]);

// The page's frontmatter keys the collection does not show (page options such as the icon are not
// properties at all).
export function strayEntries(
  properties: readonly DatabaseProperty[],
  values: Record<string, unknown>,
): [string, unknown][] {
  const shown = new Set(
    properties.filter((p) => p.type !== "title" && isStoredType(p.type)).map((p) => p.key),
  );
  return userPropertyEntries(values).filter(([key]) => !shown.has(key));
}

// Whether `key` can become a property of a collection with these properties (database.addProperty
// takes it as given, so it must be a valid key no other stored property uses, and not a page option).
export function canAdopt(key: string, properties: readonly DatabaseProperty[]): boolean {
  if (key !== key.trim() || key.length === 0 || key.length > 128) return false;
  if (/^(file|formula|note|this)\./.test(key) || isPageOptionKey(key)) return false;
  return !properties.some((p) => p.key === key && (FIXED.has(p.type) || isStoredType(p.type)));
}

// The collection property for an existing key: the same key and name, the type read from the
// value. A list's values become its options so they show as they did.
export function adoptedProperty(
  key: string,
  value: unknown,
  chosen?: PropertyType | null,
): NewProperty {
  const type = inferType(value, chosen);
  const config: NewProperty["config"] = {};
  if (type === "multiSelect" && Array.isArray(value)) {
    const names = [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))];
    config.options = names.map((name) => ({ name, color: "default" as const }));
  }
  if (type === "date" && typeof value === "string" && value.includes("/")) config.range = true;
  return { name: key.slice(0, 200), key, type, config };
}

// ---- The catalogue: properties other collections have, to reuse by name

export type CatalogueEntry = {
  collectionId: string;
  collection: string;
  name: string;
  type: PropertyType;
  config: PropertyConfig;
};

// Types whose settings can be copied as they are (relations, rollups and formulas point at other
// properties).
const COPYABLE = (type: PropertyType) =>
  type !== "title" && type !== "relation" && type !== "rollup" && type !== "formula";

export function catalogueOf(
  collections: readonly { title: string; definition: DatabaseDefinition }[],
  excludeId: string | null,
): CatalogueEntry[] {
  const out: CatalogueEntry[] = [];
  for (const { title, definition } of collections) {
    if (definition.database.id === excludeId) continue;
    for (const p of definition.properties) {
      if (!COPYABLE(p.type)) continue;
      out.push({
        collectionId: definition.database.id,
        collection: title,
        name: p.name,
        type: p.type,
        config: p.config,
      });
    }
  }
  return out;
}

// Entries whose name starts with what was typed, closest first.
export function suggest(
  entries: readonly CatalogueEntry[],
  text: string,
  limit = 5,
): CatalogueEntry[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  return entries
    .filter((e) => e.name.toLowerCase().startsWith(q))
    .sort((a, b) => a.name.length - b.name.length || a.collection.localeCompare(b.collection))
    .slice(0, limit);
}

// "Status · from Projects · 4 options"
export function describeEntry(entry: CatalogueEntry): string {
  const options = entry.config.options?.length;
  const detail =
    options !== undefined
      ? `${options} ${options === 1 ? "option" : "options"}`
      : TYPE_LABELS[entry.type];
  return `${entry.name} · from ${entry.collection} · ${detail}`;
}

// The settings to create a copy with (new option ids).
export function copiedConfig(entry: CatalogueEntry): NewProperty["config"] {
  const { options, ...rest } = entry.config;
  return options
    ? { ...rest, options: options.map(({ id: _id, ...o }) => o) }
    : (rest as NewProperty["config"]);
}
