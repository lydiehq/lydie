// A plain description of the store's synced tables, the single source a sync peer's client schema
// is checked against: the server's sync streams must deliver these tables with these columns.
// `describeSchema` reads any PowerSync `Schema` (or an object of the same shape); `schemaDrift`
// lists the differences; `assertSyncedSchema` throws on any, for a test outside this package:
//
//   import { assertSyncedSchema } from "@lydie/store";
//   assertSyncedSchema(theirClientSchema);
import { createSchema } from "./schema.ts";

export type ColumnType = "TEXT" | "INTEGER" | "REAL";

export type SchemaDescription = {
  // Table → column → type. Every table has an implicit `id TEXT` primary key, not listed.
  tables: Record<string, Record<string, ColumnType>>;
};

export type SchemaDrift =
  | { kind: "missingTable"; table: string }
  | { kind: "extraTable"; table: string }
  | { kind: "missingColumn"; table: string; column: string; type: ColumnType }
  | { kind: "extraColumn"; table: string; column: string; type: ColumnType }
  | {
      kind: "typeMismatch";
      table: string;
      column: string;
      expected: ColumnType;
      actual: ColumnType;
    };

type SchemaLike = {
  tables: readonly {
    name: string;
    localOnly?: boolean;
    columns: readonly { name: string; type?: unknown }[];
  }[];
};

// Synced tables only (local-only ones never reach a peer).
export function describeSchema(schema: SchemaLike): SchemaDescription {
  const tables: SchemaDescription["tables"] = {};
  for (const table of schema.tables) {
    if (table.localOnly) continue;
    const columns: Record<string, ColumnType> = {};
    for (const c of [...table.columns].sort((a, b) => a.name.localeCompare(b.name))) {
      columns[c.name] = (typeof c.type === "string" ? c.type.toUpperCase() : "TEXT") as ColumnType;
    }
    tables[table.name] = columns;
  }
  return {
    tables: Object.fromEntries(Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))),
  };
}

// The store's synced tables, as a hosted workspace's client schema must define them.
export const SYNCED_SCHEMA: SchemaDescription = describeSchema(createSchema("synced"));

// What `actual` lacks or has beyond `expected` (default: the store's synced schema).
export function schemaDrift(
  actual: SchemaDescription,
  expected: SchemaDescription = SYNCED_SCHEMA,
): SchemaDrift[] {
  const out: SchemaDrift[] = [];
  const names = new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)]);
  for (const table of [...names].sort()) {
    const want = expected.tables[table];
    const have = actual.tables[table];
    if (!have) {
      out.push({ kind: "missingTable", table });
      continue;
    }
    if (!want) {
      out.push({ kind: "extraTable", table });
      continue;
    }
    const columns = new Set([...Object.keys(want), ...Object.keys(have)]);
    for (const column of [...columns].sort()) {
      const w = want[column];
      const h = have[column];
      if (!h) out.push({ kind: "missingColumn", table, column, type: w! });
      else if (!w) out.push({ kind: "extraColumn", table, column, type: h });
      else if (w !== h) {
        out.push({ kind: "typeMismatch", table, column, expected: w, actual: h });
      }
    }
  }
  return out;
}

// Throws listing every difference between `schema` (a PowerSync Schema or a description) and the
// store's synced tables.
export function assertSyncedSchema(schema: SchemaLike | SchemaDescription): void {
  // A PowerSync Schema lists its tables; a description keys them by name.
  const actual = Array.isArray(schema.tables)
    ? describeSchema(schema as SchemaLike)
    : (schema as SchemaDescription);
  const drift = schemaDrift(actual);
  if (drift.length === 0) return;
  const lines = drift.map((d) =>
    d.kind === "missingTable" || d.kind === "extraTable"
      ? `${d.kind}: ${d.table}`
      : d.kind === "typeMismatch"
        ? `typeMismatch: ${d.table}.${d.column} (expected ${d.expected}, got ${d.actual})`
        : `${d.kind}: ${d.table}.${d.column} ${d.type}`,
  );
  throw new Error(`Client schema differs from @lydie/store's synced tables:\n${lines.join("\n")}`);
}
