import { afterEach, describe, expect, it } from "bun:test";

import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";

import { closeTestStores, openTestStore } from "./test-utils.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;
const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;

afterEach(closeTestStores);

function deterministic() {
  let tick = Date.parse("2026-11-15T10:00:00.000Z");
  let n = 0;
  const uuid = () => `0193a5e2-7c3b-7000-8000-${String(n++).padStart(12, "0")}`;
  return { clock: { now: () => new Date((tick += 1000)) }, ids: { uuid } };
}

// Every thread operation, and what the queries say at each stage.
async function scenario(runtime: Runtime) {
  const { ops } = runtime;
  const doc = await ops.doc.create({
    workspaceId: WS,
    title: "Plan",
    markdown: "# Plan\n\nA filter on the **cloud sync** peer.\n\nA filter too.",
  });
  const other = await ops.doc.create({ workspaceId: WS, title: "Other", markdown: "Text" });
  const session = runtime.as(agent, "*", { sessionId: "mcp-1" });
  const note = await session.thread.create({
    documentId: doc.id,
    body: "Checked against the plan.",
    quote: "the **cloud sync** peer",
  });
  const comment = await ops.thread.create({ documentId: doc.id, kind: "comment", body: "Why?" });
  await session.thread.create({ documentId: doc.id, body: "Nobody touches this one." });
  const kept = await ops.thread.create({ documentId: other.id, body: "Stays" });
  const replied = await session.thread.reply({ threadId: comment.id, body: "Because." });
  await ops.thread.reply({ threadId: comment.id, body: "Thanks" });
  await ops.thread.edit({ id: note.id, body: "Checked against the plan, section 3." });
  await ops.thread.setAnchor({ id: note.id, anchor: { quote: "A filter too" } });
  await ops.thread.setAnchor({ id: comment.id, anchor: null });
  await ops.thread.delete({ id: replied.replies[0]!.id });
  const open = (await ops.thread.list({ documentId: doc.id })).threads;
  await ops.thread.resolve({ id: comment.id });
  const resolved = (await ops.thread.list({ documentId: doc.id, state: "resolved" })).threads;
  await ops.thread.delete({ id: note.id });
  const all = (await ops.thread.list({ documentId: doc.id, state: "all" })).threads;
  await ops.thread.restore({ id: note.id });
  await ops.history.undoSession({ sessionId: "mcp-1" });
  const afterUndo = (await ops.thread.list({ documentId: doc.id, state: "all" })).threads;
  await ops.doc.delete({ id: doc.id });
  await ops.doc.purge({ id: doc.id });
  return {
    note,
    open,
    resolved,
    all,
    afterUndo,
    kept: (await ops.thread.list({ documentId: other.id })).threads.map((t) => t.id === kept.id),
  };
}

describe("threads", () => {
  it("SQLite and memory ports agree", async () => {
    const { store } = await openTestStore();
    const sqlite = createRuntime({ ...store.ports, actor: user, ...deterministic() });
    const memory = createRuntime({ ...createMemoryPorts(), actor: user, ...deterministic() });
    const fromSqlite = await scenario(sqlite);
    expect(fromSqlite).toEqual(await scenario(memory));

    expect(fromSqlite.note.anchor).toEqual({
      quote: "the cloud sync peer",
      prefix: "Plan\nA filter on ",
      suffix: ".\nA filter too.",
    });
    expect(fromSqlite.open.map((t) => [t.kind, t.anchor?.quote ?? null, t.replies.length])).toEqual(
      [
        ["note", "A filter too", 0],
        ["comment", null, 1],
        ["note", null, 0],
      ],
    );
    expect(fromSqlite.resolved.map((t) => t.kind)).toEqual(["comment"]);
    expect(fromSqlite.all.map((t) => t.kind)).toEqual(["comment", "note"]);
    // Undoing the agent's session takes back the note nobody else changed. The one a person
    // edited since stays, as any later change by someone else does.
    expect(fromSqlite.afterUndo.map((t) => [t.kind, t.replies.length])).toEqual([
      ["note", 0],
      ["comment", 1],
    ]);
    expect(fromSqlite.kept).toEqual([true]);

    const left = await store.db.getAll<{ document_id: string }>("SELECT document_id FROM threads");
    expect(left).toHaveLength(1);
  });
});
