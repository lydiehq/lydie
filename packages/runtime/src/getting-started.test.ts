import { describe, expect, it } from "bun:test";

import { gettingStartedId, starterId } from "@lydie/contract";

import { createGettingStarted } from "./getting-started.ts";
import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";

const WS = "01JWORKSPACE0000000000000A";

function setup() {
  const ports = createMemoryPorts();
  return createRuntime({ ...ports, actor: { type: "user", id: "u" } });
}

describe("createGettingStarted (LYD-313)", () => {
  it("creates the page, a linked child page and a small database", async () => {
    const runtime = setup();
    const created = await createGettingStarted(runtime.ops, {
      workspaceId: WS,
      mode: "browser",
      today: "2026-11-15",
    });
    const id = gettingStartedId(WS);
    expect(created).toEqual({ id });

    const { entries } = await runtime.ops.doc.listTree({ workspaceId: WS });
    expect(entries.map((e) => [e.depth, e.title])).toEqual([
      [0, "Getting started"],
      [1, "Links and backlinks"],
      [1, "Reading list"],
      [2, "The Design of Everyday Things"],
      [2, "Thinking in Systems"],
      [2, "How to Take Smart Notes"],
    ]);

    const root = await runtime.ops.doc.get({ id });
    expect(root.document.properties).toEqual({ icon: "👋" });
    expect(root.body?.markdown).toContain("![[Reading list.base]]");

    // The links in its body resolve: the child page lists it as a backlink.
    const links = starterId(WS, "links");
    const { backlinks } = await runtime.ops.doc.backlinks({ id: links });
    expect(backlinks.map((b) => b.source.id)).toContain(id);

    const db = await runtime.ops.database.get({ id: starterId(WS, "reading-list") });
    expect(db.properties.map((p) => [p.name, p.type])).toEqual([
      ["Name", "title"],
      ["Status", "select"],
      ["Finished", "date"],
    ]);
    expect(db.views.map((v) => v.type)).toEqual(["table", "board"]);
    const book = await runtime.ops.doc.get({ id: starterId(WS, "book-1"), includeBody: false });
    expect(book.document.properties).toEqual({ status: "Done", finished: "2026-11-03" });
  });

  it("runs once per workspace, also after the page went to the trash", async () => {
    const runtime = setup();
    await createGettingStarted(runtime.ops, { workspaceId: WS, mode: "folder" });
    const count = async () =>
      (await runtime.ops.doc.listTree({ workspaceId: WS, includeDeleted: true })).entries.length;
    const before = await count();
    expect(await createGettingStarted(runtime.ops, { workspaceId: WS, mode: "folder" })).toBeNull();
    await runtime.ops.doc.delete({ id: gettingStartedId(WS) });
    expect(await createGettingStarted(runtime.ops, { workspaceId: WS, mode: "folder" })).toBeNull();
    expect(await count()).toBe(before);
  });

  it("is one transaction and no undo step when run inside runtime.transaction", async () => {
    const runtime = setup();
    await runtime.transaction(
      "Getting started",
      (ops) => createGettingStarted(ops, { workspaceId: WS, mode: "browser" }),
      { history: false },
    );
    expect(runtime.history.canUndo()).toBe(false);
    await runtime.ops.doc.get({ id: gettingStartedId(WS), includeBody: false });
  });
});
