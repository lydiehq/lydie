// uniqueId properties ("LYD-12"): numbers assigned by createRow, duplicateRows, addProperty and
// changePropertyType; explicit values; filters, sorts and search.
import { describe, expect, it } from "bun:test";

import { LydieError } from "@lydie/contract";
import type { FilterNode, PropertyValue } from "@lydie/contract";

import { createMemoryPorts } from "../memory/index.ts";
import type { Db, DbTx } from "../ports.ts";
import { createRuntime } from "../runtime.ts";

const WS = "ws1";

function setup(options: { portless?: boolean } = {}) {
  const ports = createMemoryPorts();
  let tick = Date.parse("2026-03-01T10:00:00.000Z");
  // Without `nextUniqueId`, the runtime scans the rows itself.
  const strip = <T extends { databases?: object }>(tx: T): T => {
    if (!tx.databases) return tx;
    const { nextUniqueId: _, ...databases } = tx.databases as DbTx["databases"] & {};
    return { ...tx, databases };
  };
  const db: Db = options.portless
    ? {
        read: (fn) => ports.db.read((tx) => fn(strip(tx))),
        write: (fn) => ports.db.write((tx) => fn(strip(tx))),
      }
    : ports.db;
  const runtime = createRuntime({
    ...ports,
    db,
    actor: { type: "user", id: "me" },
    clock: { now: () => new Date((tick += 1000)) },
  });
  return { ports, runtime, ops: runtime.ops };
}

async function issues(options: { portless?: boolean } = {}) {
  const ctx = setup(options);
  const { ops } = ctx;
  const created = await ops.database.create({ workspaceId: WS, title: "Issues" });
  const db = created.database.id;
  const title = created.properties.find((p) => p.type === "title")!;
  const row = (t: string, values: Record<string, PropertyValue> = {}) =>
    ops.database.createRow({ databaseId: db, title: t, values });
  const valuesOf = async (key: string) => {
    const docs = await ctx.runtime.ops.doc.listChildren({
      workspaceId: WS,
      parentId: db,
      includeDeleted: true,
    });
    const out: Record<string, unknown> = {};
    for (const d of docs.entries) {
      const full = await ops.doc.get({ id: d.id, includeBody: false });
      out[d.title] = full.document.properties[key];
    }
    return out;
  };
  return { ...ctx, db, title, row, valuesOf };
}

const addId = (
  f: Awaited<ReturnType<typeof issues>>,
  extra: { key?: string; name?: string } = {},
) =>
  f.ops.database.addProperty({
    databaseId: f.db,
    name: extra.name ?? "ID",
    type: "uniqueId",
    config: { prefix: "LYD" },
    ...(extra.key ? { key: extra.key } : {}),
  });

async function query(f: Awaited<ReturnType<typeof issues>>, config: Record<string, unknown>) {
  const result = await f.ops.database.query({
    databaseId: f.db,
    view: { type: "table", config },
  });
  return result.rows.map((r) => r.title);
}

describe("uniqueId", () => {
  for (const portless of [false, true]) {
    it(`numbers new rows after the largest id, trashed rows included${portless ? " (no port)" : ""}`, async () => {
      const f = await issues({ portless });
      const id = await addId(f);
      expect(id).toMatchObject({ key: "ID", config: { prefix: "LYD" } });
      const a = await f.row("A");
      const b = await f.row("B");
      expect(a.properties.ID).toBe(1);
      expect(b.properties.ID).toBe(2);
      await f.ops.doc.delete({ id: b.id });
      const c = await f.row("C");
      expect(c.properties.ID).toBe(3);
      // Given values are kept (as shown or as numbers); the next continues after them.
      expect((await f.row("D", { [id.id]: "lyd-10" })).properties.ID).toBe(10);
      expect((await f.row("E", { [id.id]: null })).properties.ID).toBe(11);
    });
  }

  it("backfills existing rows in creation order on add, and undo takes the numbers away", async () => {
    const f = await issues();
    const first = await f.row("First");
    await f.row("Second");
    const third = await f.row("Third");
    await f.ops.doc.delete({ id: third.id });
    // A row that already holds a number under the key keeps it.
    await f.ops.doc.setProperties({ id: first.id, set: { ID: 7 } });
    await addId(f);
    expect(await f.valuesOf("ID")).toEqual({ First: 7, Second: 8, Third: 9 });

    await f.runtime.history.undo();
    expect(await f.valuesOf("ID")).toEqual({ First: 7, Second: undefined, Third: undefined });
    const def = await f.ops.database.get({ id: f.db });
    expect(def.properties.some((p) => p.type === "uniqueId")).toBe(false);

    await f.runtime.history.redo();
    expect(await f.valuesOf("ID")).toEqual({ First: 7, Second: 8, Third: 9 });
  });

  it("does not copy ids from templates or duplicated rows", async () => {
    const f = await issues();
    const id = await addId(f);
    const template = await f.row("Template");
    await f.ops.database.update({ id: f.db, templateIds: [template.id] });
    const fromTemplate = await f.ops.database.createRow({
      databaseId: f.db,
      title: "From template",
      templateId: template.id,
    });
    expect(fromTemplate.properties.ID).toBe(2);
    const { rows } = await f.ops.database.duplicateRows({
      databaseId: f.db,
      rowIds: [fromTemplate.id, template.id],
    });
    expect(rows.map((r) => r.properties.ID)).toEqual([3, 4]);
    // Undo takes the copies' numbers back (and trashes them), so they are free again.
    await f.runtime.history.undo();
    expect((await f.row("Next")).properties[id.key]).toBe(3);
  });

  it("is never implied by a view's filter", async () => {
    const f = await issues();
    const id = await addId(f);
    const filter: FilterNode = { type: "condition", propertyId: id.id, op: "eq", value: 40 };
    const view = await f.ops.database.createView({
      databaseId: f.db,
      name: "Forty",
      type: "table",
      config: { filter } as never,
    });
    const row = await f.ops.database.createRow({ databaseId: f.db, title: "R", viewId: view.id });
    expect(row.properties.ID).toBe(1);
  });

  it("accepts explicit values and rejects others", async () => {
    const f = await issues();
    const id = await addId(f);
    const row = await f.row("A");
    await f.ops.database.setValues({
      databaseId: f.db,
      rowIds: [row.id],
      set: { [id.id]: "LYD-5" },
    });
    expect((await f.ops.doc.get({ id: row.id, includeBody: false })).document.properties.ID).toBe(
      5,
    );
    for (const bad of ["ABC-5", 0, 1.5, "five"]) {
      const error = await f.ops.database
        .setValues({ databaseId: f.db, rowIds: [row.id], set: { [id.id]: bad } })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LydieError);
    }
    const written = await f.ops.database.writeRows({
      databaseId: f.db,
      rows: [{ title: "Imported", values: { ID: "LYD-42" } }, { title: "Fresh" }],
    });
    expect(written.rows.map((r) => [r.title, r.uniqueId, r.action])).toEqual([
      ["Imported", "LYD-42", "created"],
      ["Fresh", "LYD-43", "created"],
    ]);
    const [imported, fresh] = await Promise.all(
      written.rows.map((row) => f.ops.doc.get({ id: row.id, includeBody: false })),
    );
    expect(imported!.document.properties.ID).toBe(42);
    expect(fresh!.document.properties.ID).toBe(43);
  });

  it('reserves the key "id"', async () => {
    const f = await issues();
    const error = await addId(f, { key: "id" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "invalid_input" });
    expect((await addId(f, { name: "id" })).key).toBe("id 2");
    const number = await f.ops.database.addProperty({
      databaseId: f.db,
      name: "id",
      type: "number",
      key: "id",
    });
    const change = await f.ops.database
      .changePropertyType({ id: number.id, type: "uniqueId" })
      .catch((e: unknown) => e);
    expect(change).toMatchObject({ code: "invalid_input" });
  });

  it("numbers rows afresh when a property becomes a uniqueId, and converts back as shown", async () => {
    const f = await issues();
    const number = await f.ops.database.addProperty({
      databaseId: f.db,
      name: "Ref",
      type: "number",
    });
    await f.row("A", { [number.id]: 50 });
    await f.row("B");
    await f.row("C", { [number.id]: 50 });
    const { converted } = await f.ops.database.changePropertyType({
      id: number.id,
      type: "uniqueId",
      config: { prefix: "REF" },
    });
    expect(converted).toBe(3);
    expect(await f.valuesOf("Ref")).toEqual({ A: 1, B: 2, C: 3 });
    expect((await f.row("D")).properties.Ref).toBe(4);

    await f.runtime.history.undo();
    await f.runtime.history.undo();
    expect(await f.valuesOf("Ref")).toEqual({ A: 50, B: undefined, C: 50 });
    const def = await f.ops.database.get({ id: f.db });
    expect(def.properties.find((p) => p.id === number.id)?.type).toBe("number");

    // Numbering covers trashed rows (D, whose creation was undone); conversions only live ones.
    await f.runtime.history.redo();
    await f.ops.database.changePropertyType({ id: number.id, type: "text" });
    expect(await f.valuesOf("Ref")).toEqual({ A: "REF-1", B: "REF-2", C: "REF-3", D: 4 });
  });

  it("keeps the prefix only on uniqueId properties", async () => {
    const f = await issues();
    const text = await f.ops.database.addProperty({
      databaseId: f.db,
      name: "Note",
      type: "text",
      config: { prefix: "X" },
    });
    expect(text.config.prefix).toBeUndefined();
    const id = await f.ops.database.addProperty({
      databaseId: f.db,
      name: "ID",
      type: "uniqueId",
      config: { prefix: "" },
    });
    expect(id.config).toEqual({});
  });

  it("filters and sorts like a number, with values as shown", async () => {
    const f = await issues();
    const id = await addId(f);
    for (const t of ["A", "B", "C", "D"]) await f.row(t);
    const where = (op: string, value: unknown) => ({
      filter: { type: "condition", propertyId: id.id, op, value },
    });
    expect(await query(f, where("eq", "LYD-2"))).toEqual(["B"]);
    expect(await query(f, where("eq", "lyd-2"))).toEqual(["B"]);
    expect(await query(f, where("eq", 2))).toEqual(["B"]);
    expect(await query(f, where("eq", "ABC-2"))).toEqual([]);
    expect(await query(f, where("gte", "LYD-3"))).toEqual(["C", "D"]);
    expect(await query(f, where("between", ["LYD-2", 3]))).toEqual(["B", "C"]);
    expect(await query(f, where("in", ["LYD-1", "LYD-4"]))).toEqual(["A", "D"]);
    expect(await query(f, where("neq", "LYD-1"))).toEqual(["B", "C", "D"]);
    expect(await query(f, { sorts: [{ propertyId: id.id, direction: "desc" }] })).toEqual([
      "D",
      "C",
      "B",
      "A",
    ]);
  });

  it('finds a row by its id in search ("LYD-12")', async () => {
    const f = await issues();
    await addId(f);
    await f.row("Alpha");
    const beta = await f.row("Beta");
    for (const q of ["LYD-2", "lyd-2", " LYD-2 "]) {
      const { hits } = await f.ops.doc.search({ workspaceId: WS, query: q });
      expect(hits[0]).toMatchObject({ id: beta.id, title: "Beta", snippet: "<mark>LYD-2</mark>" });
    }
    expect((await f.ops.doc.search({ workspaceId: WS, query: "ABC-2" })).hits).toEqual([]);
    expect((await f.ops.doc.search({ workspaceId: WS, query: "LYD-9" })).hits).toEqual([]);
  });
});
