// uniqueId properties ("LYD-12") in SQLite: view filters and sorts agree with runView, the next
// number counts trashed rows, and search finds a row by its id.
import { afterEach, describe, expect, it } from "bun:test";

import type { FilterNode, ViewConfigInput } from "@lydie/contract";
import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";

import { queries } from "./queries.ts";
import { closeTestStores, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const WS = "ws1";

function deterministic() {
  let tick = Date.parse("2026-02-20T10:00:00.000Z");
  let n = 0;
  const uuid = () => `0193a5e2-7c3b-7000-8000-${String(n++).padStart(12, "0")}`;
  return { clock: { now: () => new Date((tick += 60_000)) }, ids: { uuid } };
}

async function scenario(runtime: Runtime) {
  const { ops } = runtime;
  const issues = await ops.database.create({ workspaceId: WS, title: "Issues" });
  const db = issues.database.id;
  const rows = [];
  for (const title of ["Before one", "Before two"]) {
    rows.push(await ops.database.createRow({ databaseId: db, title }));
  }
  const id = await ops.database.addProperty({
    databaseId: db,
    name: "ID",
    type: "uniqueId",
    config: { prefix: "LYD" },
  });
  for (let i = 0; i < 8; i++) {
    rows.push(await ops.database.createRow({ databaseId: db, title: `Issue ${i}` }));
  }
  // A hand-written value of the wrong shape, as a file could hold it; and a trashed row.
  await ops.doc.setProperties({ id: rows[4]!.id, set: { ID: "LYD-99" } });
  await ops.doc.delete({ id: rows[9]!.id });
  return { db, id, title: issues.properties[0]!, rows };
}

describe("uniqueId in SQLite", () => {
  it("filters and sorts as runView does", async () => {
    const memory = createRuntime({
      ...createMemoryPorts(),
      actor: { type: "user", id: "u1" },
      ...deterministic(),
    });
    const { store } = await openTestStore();
    const sqlite = createRuntime({
      ...store.ports,
      actor: { type: "user", id: "u1" },
      ...deterministic(),
    });
    const a = await scenario(memory);
    const { db, id, title } = await scenario(sqlite);
    expect(db).toBe(a.db);
    const c = (op: string, value?: unknown): FilterNode =>
      ({
        type: "condition",
        propertyId: id.id,
        op,
        ...(value === undefined ? {} : { value }),
      }) as FilterNode;
    const configs: ViewConfigInput[] = [
      { filter: c("eq", "LYD-3") },
      { filter: c("eq", "lyd-3") },
      { filter: c("eq", 3) },
      { filter: c("eq", "3") },
      { filter: c("eq", "ABC-3") },
      { filter: c("neq", "LYD-3") },
      { filter: c("lt", "LYD-4") },
      { filter: c("gte", 6) },
      { filter: c("between", ["LYD-2", "LYD-5"]) },
      { filter: c("in", ["LYD-1", 7, "nope"]) },
      { filter: c("notIn", ["LYD-1"]) },
      { filter: c("isEmpty") },
      { filter: c("isNotEmpty") },
      { sorts: [{ propertyId: id.id, direction: "asc" }] },
      { sorts: [{ propertyId: id.id, direction: "desc" }] },
      // Not offered in the UI, but a view may still name one.
      { groupBy: { propertyId: id.id, direction: "desc" } },
    ];
    for (const config of configs) {
      const input = {
        databaseId: db,
        view: {
          type: "table" as const,
          config: { sorts: [{ propertyId: title.id, direction: "asc" as const }], ...config },
        },
      };
      const [expected, actual] = await Promise.all([
        memory.ops.database.query(input),
        sqlite.ops.database.query(input),
      ]);
      expect({ config, actual }).toEqual({ config, actual: expected });
    }
    const eq3 = await sqlite.ops.database.query({
      databaseId: db,
      view: { type: "table", config: { filter: c("eq", "LYD-3") } },
    });
    expect(eq3.rows.map((r) => r.title)).toEqual(["Issue 0"]);
  });

  it("numbers after the largest id of any row, trashed included", async () => {
    const { store, runtime } = await openTestStore();
    const { db, id, rows } = await scenario(runtime);
    // Backfill numbered the two earlier rows 1 and 2; the trashed row (10) still counts.
    const next = await runtime.ops.database.createRow({ databaseId: db, title: "Next" });
    expect(next.properties.ID).toBe(11);
    const trashed = await runtime.ops.doc.get({ id: rows[9]!.id, includeBody: false });
    expect(trashed.document.properties.ID).toBe(10);
    const nextId = await store.ports.db.write((tx) => tx.databases!.nextUniqueId!(db, id.key));
    expect(nextId).toBe(12);
    // Strings and fractions are not ids.
    await runtime.ops.doc.setProperties({ id: next.id, set: { ID: 500.5 } });
    expect(await store.ports.db.write((tx) => tx.databases!.nextUniqueId!(db, id.key))).toBe(11);
    expect(await store.ports.db.write((tx) => tx.databases!.nextUniqueId!(db, "missing"))).toBe(1);
  });

  it('finds a row by its id in search ("LYD-3")', async () => {
    const { store, runtime } = await openTestStore();
    const { rows } = await scenario(runtime);
    const target = rows[2]!;
    for (const text of ["LYD-3", "lyd-3", " LYD-3 "]) {
      const hits = await store.query(queries.search(WS, text));
      expect(hits[0]).toMatchObject({ id: target.id, snippet: "<mark>LYD-3</mark>" });
      expect(hits.filter((h) => h.id === target.id)).toHaveLength(1);
    }
    const { hits } = await runtime.ops.doc.search({ workspaceId: WS, query: "LYD-3" });
    expect(hits[0]?.id).toBe(target.id);
    expect(await store.query(queries.search(WS, "ABC-3"))).toEqual([]);
    // The trashed row (10) is not found.
    expect(await store.query(queries.search(WS, "LYD-10"))).toEqual([]);
    // Ordinary search is unchanged.
    expect((await store.query(queries.search(WS, "Issue 5"))).map((h) => h.title)).toContain(
      "Issue 5",
    );
  });
});
