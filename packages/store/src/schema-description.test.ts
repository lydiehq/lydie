import { describe, expect, it } from "bun:test";

import { column, Schema, Table } from "@powersync/common";

import {
  assertSyncedSchema,
  describeSchema,
  schemaDrift,
  SYNCED_SCHEMA,
} from "./schema-description.ts";
import { createSchema, SYNCED_TABLES } from "./schema.ts";

describe("synced schema description (for checking a peer's client schema)", () => {
  it("lists exactly the synced tables with their columns", () => {
    expect(Object.keys(SYNCED_SCHEMA.tables).sort()).toEqual([...SYNCED_TABLES].sort());
    expect(SYNCED_SCHEMA.tables.workspaces).toEqual({
      created_at: "TEXT",
      created_by: "TEXT",
      image: "TEXT",
      name: "TEXT",
      updated_at: "TEXT",
    });
    expect(SYNCED_SCHEMA.tables.documents?.restricted).toBe("INTEGER");
    // Local mode syncs nothing.
    expect(describeSchema(createSchema("local")).tables).toEqual({});
    assertSyncedSchema(createSchema("synced"));
    assertSyncedSchema(SYNCED_SCHEMA);
  });

  it("reports each kind of drift", () => {
    const { database_views: _v, ...rest } = SYNCED_SCHEMA.tables;
    const theirs = describeSchema(
      new Schema({
        ...Object.fromEntries(
          Object.entries(rest).map(([name, cols]) => [
            name,
            new Table(
              Object.fromEntries(
                Object.entries(cols).map(([c, t]) => [
                  c,
                  t === "INTEGER" ? column.integer : t === "REAL" ? column.real : column.text,
                ]),
              ),
            ),
          ]),
        ),
        links: new Table({
          ...Object.fromEntries(
            Object.keys(SYNCED_SCHEMA.tables.links!)
              .filter((c) => c !== "source_property")
              .map((c) => [c, column.text]),
          ),
          extra: column.text,
        }),
        documents: new Table({
          ...Object.fromEntries(
            Object.entries(SYNCED_SCHEMA.tables.documents!).map(([c, t]) => [
              c,
              t === "INTEGER" ? column.integer : column.text,
            ]),
          ),
          restricted: column.text,
        }),
        unknown_table: new Table({ a: column.text }),
      }),
    );
    expect(schemaDrift(theirs)).toEqual([
      { kind: "missingTable", table: "database_views" },
      {
        kind: "typeMismatch",
        table: "documents",
        column: "restricted",
        expected: "INTEGER",
        actual: "TEXT",
      },
      { kind: "extraColumn", table: "links", column: "extra", type: "TEXT" },
      { kind: "missingColumn", table: "links", column: "source_property", type: "TEXT" },
      { kind: "extraTable", table: "unknown_table" },
    ]);
    expect(() => assertSyncedSchema(theirs)).toThrow(/missingColumn: links.source_property TEXT/);
  });
});
