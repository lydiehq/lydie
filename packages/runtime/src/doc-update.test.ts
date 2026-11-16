import { describe, expect, it } from "bun:test";

import { isLydieError } from "@lydie/contract";

import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";

const WS = "ws1";

function setup() {
  const ports = createMemoryPorts();
  const runtime = createRuntime({ ...ports, actor: { type: "user", id: "u1" } });
  return { ports, runtime, ops: runtime.ops };
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isLydieError(error)) return error.code;
    throw error;
  }
  throw new Error("expected an error");
}

describe("doc.update (update_doc)", () => {
  it("sets the title, properties and body in one undo step", async () => {
    const { ops, runtime, ports } = setup();
    const doc = await ops.doc.create({
      workspaceId: WS,
      title: "Draft",
      properties: { status: "todo", tags: ["x"] },
      markdown: "Hello\n",
    });
    runtime.history.clear();
    const before = ports.state.oplog.length;

    const result = await ops.doc.update({
      id: doc.id,
      title: "Final",
      properties: { status: "done" },
      unset: ["tags"],
      edits: [{ type: "append", newStr: "World" }],
    });

    expect(result.document).toMatchObject({ title: "Final", properties: { status: "done" } });
    expect(result.version).toEqual(expect.any(String));
    const got = await ops.doc.get({ id: doc.id });
    expect(got.body?.markdown).toBe("Hello\n\nWorld\n");
    expect(got.body?.version).toBe(result.version!);
    // The steps are logged, not the composite, so the core replays them.
    expect(ports.state.oplog.slice(before).map((e) => e.operation)).toEqual([
      "doc.rename",
      "doc.setProperties",
      "doc.updateBody",
    ]);
    expect(await runtime.history.undo()).toBe(true);
    expect((await ops.doc.get({ id: doc.id })).document).toMatchObject({
      title: "Draft",
      properties: { status: "todo", tags: ["x"] },
    });
  });

  it("leaves the body alone when none is given", async () => {
    const { ops, ports } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "Body\n" });
    const before = ports.state.oplog.length;
    const result = await ops.doc.update({ id: doc.id, title: "B" });
    expect(result.version).toBeNull();
    expect(ports.state.oplog.slice(before).map((e) => e.operation)).toEqual(["doc.rename"]);
  });

  it("changes nothing when a step fails", async () => {
    const { ops } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "Body\n" });
    const read = await ops.doc.get({ id: doc.id });

    expect(
      await errorOf(
        ops.doc.update({
          id: doc.id,
          title: "B",
          properties: { status: "done" },
          edits: [{ type: "replace", oldStr: "not there", newStr: "x" }],
        }),
      ),
    ).toBe("invalid_input");
    await ops.doc.updateBody({ id: doc.id, markdown: "Changed\n" });
    expect(
      await errorOf(
        ops.doc.update({
          id: doc.id,
          title: "B",
          markdown: "Mine\n",
          expectedVersion: read.body!.version,
        }),
      ),
    ).toBe("conflict");

    const after = await ops.doc.get({ id: doc.id });
    expect(after.document).toMatchObject({ title: "A", properties: {} });
    expect(after.body?.markdown).toBe("Changed\n");
  });

  it("checks a database row's values against the database", async () => {
    const { ops } = setup();
    const tasks = await ops.database.create({ workspaceId: WS, title: "Tasks" });
    const db = tasks.database.id;
    await ops.database.addProperty({ databaseId: db, name: "Estimate", type: "number" });
    const tags = await ops.database.addProperty({
      databaseId: db,
      name: "Tags",
      type: "multiSelect",
    });
    const row = await ops.database.createRow({ databaseId: db, title: "Write" });

    // Values by property name; a new select option is added, as write_database_rows does.
    await ops.doc.update({ id: row.id, properties: { Estimate: 3, Tags: ["red"] } });
    const got = await ops.doc.get({ id: row.id, includeBody: false });
    expect(got.document.properties).toMatchObject({ Estimate: 3, Tags: ["red"] });
    const def = await ops.database.get({ id: db });
    expect(
      def.properties.find((p) => p.id === tags.id)?.config.options?.map((o) => o.name),
    ).toEqual(["red"]);

    expect(await errorOf(ops.doc.update({ id: row.id, properties: { Estimate: "lots" } }))).toBe(
      "invalid_input",
    );
  });

  it("needs something to change, and not both markdown and edits", async () => {
    const { ops } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A" });
    expect(await errorOf(ops.doc.update({ id: doc.id }))).toBe("invalid_input");
    expect(
      await errorOf(
        ops.doc.update({ id: doc.id, markdown: "x", edits: [{ type: "append", newStr: "y" }] }),
      ),
    ).toBe("invalid_input");
  });
});
