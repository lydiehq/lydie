import { describe, expect, it } from "bun:test";

import { isUuid, LydieError } from "@lydie/contract";

import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";
import { applyEdits, extractLinks, linkKey } from "./text.ts";
import { createUuidGenerator } from "./uuid.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;

function setup() {
  const ports = createMemoryPorts();
  let tick = Date.parse("2026-11-12T10:00:00.000Z");
  const runtime = createRuntime({
    ...ports,
    actor: user,
    clock: { now: () => new Date((tick += 1000)) },
  });
  return { ports, runtime, ops: runtime.ops };
}

async function titles(ops: ReturnType<typeof setup>["ops"], rootId?: string) {
  const { entries } = await ops.doc.listTree({ workspaceId: WS, ...(rootId ? { rootId } : {}) });
  return entries.map((e) => `${"  ".repeat(e.depth)}${e.title}`);
}

describe("document operations", () => {
  it("creates documents in order and lists the tree depth-first", async () => {
    const { ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const c = await ops.doc.create({ workspaceId: WS, title: "C" });
    await ops.doc.create({ workspaceId: WS, title: "B", afterId: a.id });
    await ops.doc.create({ workspaceId: WS, title: "First", beforeId: a.id });
    await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
    await ops.doc.create({ workspaceId: WS, title: "C1", parentId: c.id });
    expect(await titles(ops)).toEqual(["First", "A", "  A1", "B", "C", "  C1"]);
    expect(await titles(ops, a.id)).toEqual(["A1"]);
    expect(isUuid(a.id)).toBe(true);
  });

  it("moves documents and rejects cycles", async () => {
    const { ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const b = await ops.doc.create({ workspaceId: WS, title: "B" });
    const a1 = await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
    await ops.doc.move({ id: b.id, parentId: a.id, beforeId: a1.id });
    expect(await titles(ops)).toEqual(["A", "  B", "  A1"]);
    await ops.doc.move({ id: a1.id, parentId: null, beforeId: a.id });
    expect(await titles(ops)).toEqual(["A1", "A", "  B"]);
    await expect(ops.doc.move({ id: a.id, parentId: b.id })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(ops.doc.move({ id: a.id, parentId: a.id })).rejects.toBeInstanceOf(LydieError);
  });

  it("renames, sets properties and soft-deletes with restore", async () => {
    const { ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A", properties: { tags: ["x"] } });
    const a1 = await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
    const a2 = await ops.doc.create({ workspaceId: WS, title: "A2", parentId: a.id });

    expect((await ops.doc.rename({ id: a.id, title: "Renamed" })).title).toBe("Renamed");
    const withProps = await ops.doc.setProperties({
      id: a.id,
      set: { done: true },
      unset: ["tags"],
    });
    expect(withProps.properties).toEqual({ done: true });

    await ops.doc.delete({ id: a2.id });
    const deleted = await ops.doc.delete({ id: a.id });
    expect(deleted.deletedIds).toEqual([a.id, a1.id]);
    expect(await titles(ops)).toEqual([]);
    expect((await ops.doc.delete({ id: a.id })).deletedIds).toEqual([]);

    await ops.doc.restore({ id: a.id });
    // A2 was deleted separately, so it stays deleted.
    expect(await titles(ops)).toEqual(["Renamed", "  A1"]);
  });

  it("restores to the top level when the parent is gone", async () => {
    const { ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const a1 = await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
    await ops.doc.delete({ id: a1.id });
    await ops.doc.delete({ id: a.id });
    const restored = await ops.doc.restore({ id: a1.id });
    expect(restored.parentId).toBeNull();
    expect(await titles(ops)).toEqual(["A1"]);
  });

  it("updates bodies with markdown or edits, all or nothing, with version checks", async () => {
    const { ops } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Note", markdown: "one two two" });
    const fetched = await ops.doc.get({ id: doc.id });
    expect(fetched.body?.markdown).toBe("one two two");

    // One edit that does not apply fails the call and writes nothing.
    await expect(
      ops.doc.updateBody({
        id: doc.id,
        edits: [
          { oldStr: "one", newStr: "1" },
          { oldStr: "two", newStr: "2" },
        ],
        expectedVersion: fetched.body!.version,
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "edits[1] (replace): oldStr matches 2 times; add context or set replaceAll",
      details: { editIndex: 1, code: "ambiguous_match" },
    });
    expect((await ops.doc.get({ id: doc.id })).body?.markdown).toBe("one two two");
    const edited = await ops.doc.updateBody({
      id: doc.id,
      edits: [
        { oldStr: "one", newStr: "1" },
        { type: "insertAfter", oldStr: "1", newStr: "," },
        { type: "insertBefore", oldStr: "1", newStr: "(" },
        { oldStr: "two", newStr: "2", replaceAll: true },
      ],
      expectedVersion: fetched.body!.version,
    });
    expect(edited.warnings).toEqual([]);
    expect((await ops.doc.get({ id: doc.id })).body?.markdown).toBe("(1, 2 2");

    await expect(
      ops.doc.updateBody({ id: doc.id, markdown: "x", expectedVersion: fetched.body!.version }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await ops.doc.get({ id: doc.id, includeBody: false })).body).toBeNull();
  });

  it("tracks links, backlinks and resolves dangling links on create", async () => {
    const { ops } = setup();
    const target = await ops.doc.create({ workspaceId: WS, title: "Target" });
    const source = await ops.doc.create({
      workspaceId: WS,
      title: "Source",
      markdown: "See [[Target]] and [[Later|alias]] and [t](Target.md) and `[[Code]]`.",
    });
    expect((await ops.doc.backlinks({ id: target.id })).backlinks).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ id: source.id }),
        kind: "link",
        syntax: "wikilink",
      }),
      expect.objectContaining({ kind: "link", syntax: "markdown", targetRef: "Target.md" }),
    ]);
    const later = await ops.doc.create({ workspaceId: WS, title: "later" });
    expect((await ops.doc.backlinks({ id: later.id })).backlinks).toHaveLength(1);
    await ops.doc.delete({ id: source.id });
    expect((await ops.doc.backlinks({ id: target.id })).backlinks).toEqual([]);
  });

  it("searches titles and bodies", async () => {
    const { ops } = setup();
    await ops.doc.create({ workspaceId: WS, title: "Gardening", markdown: "Tomatoes need sun" });
    await ops.doc.create({ workspaceId: WS, title: "Cooking", markdown: "Tomato soup recipe" });
    const { hits } = await ops.doc.search({ workspaceId: WS, query: "tomat" });
    expect(hits.map((h) => h.title).sort()).toEqual(["Cooking", "Gardening"]);
    expect((await ops.doc.search({ workspaceId: WS, query: "garden" })).hits[0]?.title).toBe(
      "Gardening",
    );
  });
});

describe("executor", () => {
  it("logs mutations with pinned ids and sort keys, and not queries", async () => {
    const { ops, ports } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A" });
    await ops.doc.get({ id: doc.id });
    expect(ports.state.oplog).toHaveLength(1);
    expect(ports.state.oplog[0]).toMatchObject({
      operation: "doc.create",
      workspaceId: WS,
      actor: user,
      version: "2026-11-12",
      input: { workspaceId: WS, title: "A", id: doc.id, sortKey: doc.sortKey },
    });
  });

  it("publishes events after commit and nothing on failure", async () => {
    const { ops, ports } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "x" });
    expect(ports.events.published.map((e) => e.type)).toEqual(["doc.created", "doc.bodyUpdated"]);
    expect(ports.events.published[0]?.operationId).toBe(ports.state.oplog[0]?.id);

    await expect(
      ops.doc.create({ workspaceId: WS, id: doc.id, title: "dup" }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(ports.state.oplog).toHaveLength(1);
    expect(ports.events.published).toHaveLength(2);
  });

  it("rolls back every write of a failed operation", async () => {
    const { ports } = setup();
    const runtime = createRuntime({
      ...ports,
      actor: user,
      handlers: {
        async "doc.rename"(ctx, input) {
          await ctx.tx.docs.update(input.id, { title: "half-applied" });
          throw new Error("boom");
        },
      },
    });
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
    await expect(runtime.ops.doc.rename({ id: doc.id, title: "B" })).rejects.toThrow("boom");
    expect((await runtime.ops.doc.get({ id: doc.id })).document.title).toBe("A");
  });

  it("validates input and enforces scopes", async () => {
    const { runtime } = setup();
    await expect(runtime.ops.doc.rename({ id: "nope", title: "x" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;
    const readOnly = runtime.as(agent, ["docs:read"]);
    await expect(readOnly.doc.create({ workspaceId: WS })).rejects.toMatchObject({
      code: "forbidden",
    });
    expect((await readOnly.doc.listTree({ workspaceId: WS })).entries).toEqual([]);
    await expect(
      runtime.execute("doc.get", { id: "01933e6f-2284-b878-270f-04d17c6d9e48" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("records the agent as actor", async () => {
    const { runtime, ports } = setup();
    const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;
    await runtime.as(agent).doc.create({ workspaceId: WS });
    expect(ports.state.oplog[0]?.actor).toEqual(agent);
    expect(ports.events.published[0]?.actor).toEqual(agent);
  });
});

describe("helpers", () => {
  it("mints monotonic ids", () => {
    const ids_ = createUuidGenerator(() => 1_700_000_000_000);
    const ids = Array.from({ length: 50 }, () => ids_.uuid());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
  });

  it("extracts links outside code", () => {
    const md = "[[A]] ![[B#h]] [x](../C.md#y) [w](https://x.y) ![i](img.png)\n```\n[[D]]\n```\n";
    const none = { heading: null, blockId: null, sourceBlockId: null };
    expect(extractLinks(md)).toEqual([
      { kind: "link", syntax: "wikilink", target: "A", ...none },
      { kind: "embed", syntax: "wikilink", target: "B", ...none, heading: "h" },
      { kind: "link", syntax: "markdown", target: "../C.md", ...none, heading: "y" },
    ]);
    expect(linkKey("Notes/Ideas.md")).toBe("ideas");
  });

  it("applies edits with replaceAll", () => {
    expect(applyEdits("a a", [{ oldStr: "a", newStr: "b", replaceAll: true }])).toEqual({
      markdown: "b b",
      warnings: [],
    });
  });

  it("prepends and appends blocks, also to an empty body", () => {
    const append = { type: "append" as const, newStr: "## Notes\n\nDone.\n" };
    expect(applyEdits("", [append]).markdown).toBe("## Notes\n\nDone.\n");
    expect(applyEdits("Intro.\n", [append]).markdown).toBe("Intro.\n\n## Notes\n\nDone.\n");
    expect(applyEdits("Intro.", [{ type: "append", newStr: "More." }]).markdown).toBe(
      "Intro.\n\nMore.",
    );
    expect(applyEdits("Body.\n", [{ type: "prepend", newStr: "# Title\n" }]).markdown).toBe(
      "# Title\n\nBody.\n",
    );
    expect(applyEdits("", [{ type: "prepend", newStr: "First" }]).markdown).toBe("First");
  });

  it("skips edits that do not apply when not atomic (replayed uploads)", () => {
    expect(
      applyEdits(
        "a b",
        [
          { oldStr: "x", newStr: "y" },
          { oldStr: "b", newStr: "c" },
        ],
        {
          atomic: false,
        },
      ),
    ).toEqual({
      markdown: "a c",
      warnings: [{ code: "no_match", editIndex: 0, message: "oldStr was not found in the body" }],
    });
  });
});
