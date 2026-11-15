// Schema rewrites reach rows the caller cannot see (LYD-246). A backend that hides rows (as a
// hosted workspace does for restricted pages) implements `databases.rewrite`; here the in-memory
// ports are wrapped into one that hides some rows except inside a rewrite.
import { describe, expect, it } from "bun:test";

import type { Document, SchemaRewrite } from "@lydie/contract";

import { createMemoryPorts } from "../memory/index.ts";
import type { Db, DbTx } from "../ports.ts";
import { createRuntime } from "../runtime.ts";

const WS = "ws";

function hidingBackend() {
  const ports = createMemoryPorts();
  const hidden = new Set<string>();
  const rewrites: SchemaRewrite[] = [];
  let inRewrite = 0;
  const visible = (d: Document | null) => (d && (inRewrite > 0 || !hidden.has(d.id)) ? d : null);
  const guard = (id: string) => {
    if (inRewrite === 0 && hidden.has(id)) throw new Error(`no access to ${id}`);
  };
  const wrap = <T extends DbTx | Parameters<Parameters<Db["read"]>[0]>[0]>(tx: T): T => {
    const docs = tx.docs as DbTx["docs"];
    const wrapped = {
      ...docs,
      get: async (id: string) => visible(await docs.get(id)),
      getMany: async (ids: readonly string[]) =>
        (await Promise.all(ids.map((id) => docs.get(id)))).filter(
          (d): d is Document => visible(d) !== null,
        ),
      children: async (...args: Parameters<DbTx["docs"]["children"]>) =>
        (await docs.children(...args)).filter((d) => visible(d) !== null),
      ...("update" in docs
        ? {
            update: async (id: string, patch: Parameters<DbTx["docs"]["update"]>[1]) => {
              guard(id);
              return docs.update(id, patch);
            },
            updateMany: async (updates: Parameters<NonNullable<DbTx["docs"]["updateMany"]>>[0]) => {
              for (const u of updates) guard(u.id);
              return docs.updateMany ? docs.updateMany(updates) : undefined;
            },
          }
        : {}),
    };
    const databases = tx.databases && {
      ...tx.databases,
      async rewrite<R>(rewrite: SchemaRewrite, fn: () => Promise<R>): Promise<R> {
        rewrites.push(rewrite);
        inRewrite++;
        try {
          return await fn();
        } finally {
          inRewrite--;
        }
      },
    };
    return { ...tx, docs: wrapped, databases } as T;
  };
  const db: Db = {
    read: (fn) => ports.db.read((tx) => fn(wrap(tx))),
    write: (fn) => ports.db.write((tx) => fn(wrap(tx))),
  };
  const runtime = createRuntime({ ...ports, db, actor: { type: "user", id: "u" } });
  // What a privileged reader (the system) sees, for assertions.
  const raw = createRuntime({ ...ports, actor: { type: "system", id: "test" } });
  const valueOf = async (rowId: string, key: string) =>
    (await raw.ops.doc.get({ id: rowId, includeBody: false })).document.properties[key];
  return { runtime, ops: runtime.ops, raw, hidden, rewrites, valueOf };
}

async function fixture() {
  const b = hidingBackend();
  const { ops } = b;
  const tasks = await ops.database.create({ workspaceId: WS, title: "Tasks" });
  const db = tasks.database.id;
  const status = await ops.database.addProperty({
    databaseId: db,
    name: "Status",
    type: "select",
    config: { options: [{ name: "Open" }, { name: "Done" }] },
  });
  const open = await ops.database.createRow({
    databaseId: db,
    title: "Visible",
    values: { [status.id]: "Open" },
  });
  const secret = await ops.database.createRow({
    databaseId: db,
    title: "Restricted",
    values: { [status.id]: "Open" },
  });
  b.hidden.add(secret.id);
  b.runtime.history.clear();
  return { ...b, db, status, open, secret };
}

describe("schema rewrites cover rows hidden from the caller (LYD-246)", () => {
  it("option rename and delete: every row, and undo/redo restore every row", async () => {
    const f = await fixture();
    const option = f.status.config.options!.find((o) => o.name === "Open")!;
    await f.ops.database.updateOption({
      propertyId: f.status.id,
      optionId: option.id,
      name: "Todo",
    });
    expect(await f.valueOf(f.secret.id, f.status.key)).toBe("Todo");
    expect(await f.valueOf(f.open.id, f.status.key)).toBe("Todo");
    expect(f.rewrites.at(-1)).toEqual({
      databaseId: f.db,
      propertyId: f.status.id,
      reason: "option",
    });

    await f.runtime.history.undo();
    expect(await f.valueOf(f.secret.id, f.status.key)).toBe("Open");
    await f.runtime.history.redo();
    expect(await f.valueOf(f.secret.id, f.status.key)).toBe("Todo");
    await f.runtime.history.undo();

    await f.ops.database.deleteOption({ propertyId: f.status.id, optionId: option.id });
    expect(await f.valueOf(f.secret.id, f.status.key)).toBeUndefined();
    await f.runtime.history.undo();
    expect(await f.valueOf(f.secret.id, f.status.key)).toBe("Open");
  });

  it("key and type changes: every row, and undo restores every row", async () => {
    const f = await fixture();
    await f.ops.database.updateProperty({ id: f.status.id, key: "state" });
    expect(await f.valueOf(f.secret.id, "state")).toBe("Open");
    expect(f.rewrites.at(-1)?.reason).toBe("key");
    await f.runtime.history.undo();
    expect(await f.valueOf(f.secret.id, f.status.key)).toBe("Open");
    expect(await f.valueOf(f.secret.id, "state")).toBeUndefined();

    await f.ops.database.changePropertyType({ id: f.status.id, type: "multiSelect" });
    expect(await f.valueOf(f.secret.id, f.status.key)).toEqual(["Open"]);
    expect(f.rewrites.at(-1)?.reason).toBe("type");
    await f.runtime.history.undo();
    expect(await f.valueOf(f.secret.id, f.status.key)).toBe("Open");
  });

  it("a session undo restores hidden rows too", async () => {
    const f = await fixture();
    const option = f.status.config.options!.find((o) => o.name === "Open")!;
    const agent = f.runtime.as({ type: "agent", app: "t", id: "a", onBehalfOf: "u" }, "*", {
      sessionId: "s",
    });
    await agent.database.updateOption({
      propertyId: f.status.id,
      optionId: option.id,
      name: "Todo",
    });
    const result = await f.ops.history.undoSession({ sessionId: "s" });
    expect(result.skipped).toEqual([]);
    expect(await f.valueOf(f.secret.id, f.status.key)).toBe("Open");
  });

  it("a limit-one relation reassign clears the hidden row that held the target", async () => {
    const f = await fixture();
    const projects = await f.ops.database.create({ workspaceId: WS, title: "Projects" });
    const project = await f.ops.database.addProperty({
      databaseId: f.db,
      name: "Project",
      type: "relation",
      reverseName: "Owner",
      config: { relation: { databaseId: projects.database.id, twoWay: true } },
    });
    const reverseId = project.config.relation!.reversePropertyId!;
    const reverse = await f.ops.database.updateProperty({
      id: reverseId,
      config: {
        relation: {
          databaseId: f.db,
          twoWay: true,
          reversePropertyId: project.id,
          limit: "one",
        },
      },
    });
    expect(reverse.config.relation?.limit).toBe("one");
    const atlas = await f.ops.database.createRow({
      databaseId: projects.database.id,
      title: "Atlas",
    });
    // The restricted row holds Atlas (set by someone who can see it).
    f.hidden.delete(f.secret.id);
    await f.ops.database.setValues({
      databaseId: f.db,
      rowIds: [f.secret.id],
      set: { [project.id]: [atlas.id] },
    });
    f.hidden.add(f.secret.id);
    f.runtime.history.clear();
    f.rewrites.length = 0;

    await f.ops.database.setValues({
      databaseId: f.db,
      rowIds: [f.open.id],
      set: { [project.id]: [atlas.id] },
    });
    expect(await f.valueOf(f.secret.id, project.key)).toBeUndefined();
    expect(await f.valueOf(atlas.id, reverse.key)).toEqual([f.open.id]);
    // Looked up, then written, as the same rewrite.
    expect(new Set(f.rewrites.map((r) => JSON.stringify(r)))).toEqual(
      new Set([JSON.stringify({ databaseId: f.db, propertyId: project.id, reason: "relation" })]),
    );

    await f.runtime.history.undo();
    expect(await f.valueOf(f.secret.id, project.key)).toEqual([atlas.id]);
    expect(await f.valueOf(f.open.id, project.key)).toBeUndefined();
  });

  it("without a rewrite port nothing changes (local backends)", async () => {
    const ports = createMemoryPorts();
    const { ops } = createRuntime({ ...ports, actor: { type: "user", id: "u" } });
    const t = await ops.database.create({ workspaceId: WS, title: "T" });
    const p = await ops.database.addProperty({
      databaseId: t.database.id,
      name: "S",
      type: "select",
      config: { options: [{ name: "A" }] },
    });
    const row = await ops.database.createRow({
      databaseId: t.database.id,
      title: "R",
      values: { [p.id]: "A" },
    });
    await ops.database.updateOption({
      propertyId: p.id,
      optionId: p.config.options![0]!.id,
      name: "B",
    });
    expect((await ops.doc.get({ id: row.id })).document.properties[p.key]).toBe("B");
  });
});
