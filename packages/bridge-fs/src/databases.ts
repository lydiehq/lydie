// Databases on disk: a database is a folder of rows plus `<Folder>/<Folder>.base` (Obsidian Bases
// syntax, Lydie-only settings under `lydie:`; @lydie/contract's toBase/fromBase). Pure helpers;
// the bridge decides when to read and write.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  DatabaseDefinition,
  DefinitionInput,
  PropertyInput,
  ViewInput,
} from "@lydie/contract";
import { parse as parseYaml } from "yaml";

export { BASE_EXT, baseDefinitionOf, baseFileFor } from "@lydie/contract";

function propertyInput({ id, name, type, key, config }: PropertyInput): PropertyInput {
  return { id, name, type, key, config };
}

function viewInput({ id, name, type, config }: ViewInput): ViewInput {
  return { id, name, type, config };
}

// Whether applying `next` would change the database (key order does not matter).
export function sameDefinition(current: DatabaseDefinition, next: DefinitionInput): boolean {
  return (
    stable(current.database.config) === stable(next.config) &&
    stable(current.properties.map(propertyInput)) === stable(next.properties.map(propertyInput)) &&
    stable(current.views.map(viewInput)) === stable(next.views.map(viewInput))
  );
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : v,
  );
}

// The `lydie.id` a .base file names, without interpreting the rest.
export function baseIdOf(text: string): string | null {
  try {
    const parsed = parseYaml(text) as { lydie?: { id?: unknown } } | null;
    const id = parsed?.lydie?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

// Obsidian's property types (`.obsidian/types.json`), for note properties a .base file uses
// without a Lydie type. Read-only.
export async function obsidianTypes(root: string): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await readFile(join(root, ".obsidian", "types.json"), "utf8")) as {
      types?: Record<string, unknown>;
    };
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.types ?? {})) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}
