import { describe, expect, it } from "bun:test";

import { LydieError } from "@lydie/contract";

import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;
const other = { type: "user", id: "u2" } as const;
const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;

const BODY = `# Sync scope

This is a filter on the **cloud sync** peer, not a new mechanism.

- It needs an operation
- and an exclude list

This is a filter too.
`;

function setup() {
  const ports = createMemoryPorts();
  let tick = Date.parse("2026-11-15T10:00:00.000Z");
  const runtime = createRuntime({
    ...ports,
    actor: user,
    clock: { now: () => new Date((tick += 1000)) },
  });
  return { ports, runtime, ops: runtime.ops };
}

async function page(ops: ReturnType<typeof setup>["ops"]) {
  return ops.doc.create({ workspaceId: WS, title: "Plan", markdown: BODY });
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof LydieError) return error.code;
    throw error;
  }
  return "ok";
}

describe("threads", () => {
  it("leaves a note on the page without touching the body", async () => {
    const { ops, ports } = setup();
    const doc = await page(ops);
    const note = await ops.thread.create({ documentId: doc.id, body: "Checked against the plan." });
    expect(note).toMatchObject({ kind: "note", anchor: null, replies: [], resolvedAt: null });
    expect(ports.state.bodies.get(doc.id)?.markdown).toBe(BODY);
  });

  it("come with the document, open ones only", async () => {
    const { ops } = setup();
    const doc = await page(ops);
    expect(await ops.doc.get({ id: doc.id })).not.toHaveProperty("threads");
    const note = await ops.thread.create({ documentId: doc.id, body: "Note", quote: "peer" });
    const done = await ops.thread.create({ documentId: doc.id, kind: "comment", body: "Done" });
    await ops.thread.resolve({ id: done.id });
    expect((await ops.doc.get({ id: doc.id })).threads?.map((t) => t.id)).toEqual([note.id]);
    expect(await ops.doc.get({ id: doc.id, includeBody: false })).not.toHaveProperty("threads");
  });

  it("anchors a quote to the passage as it stands in the text", async () => {
    const { ops, ports } = setup();
    const doc = await page(ops);
    const asRead = await ops.thread.create({
      documentId: doc.id,
      kind: "comment",
      body: "Which peer?",
      quote: "the cloud sync peer",
    });
    expect(asRead.anchor?.quote).toBe("the cloud sync peer");
    // The text before it, across the heading: anchors read the document as one text.
    expect(asRead.anchor?.prefix).toBe("Sync scope\nThis is a filter on ");
    // The log carries the anchor that was stored, so a replay does not look it up again.
    expect(ports.state.oplog.at(-1)?.input).toMatchObject({ ...asRead.anchor, exact: true });
    const asMarkdown = await ops.thread.create({
      documentId: doc.id,
      body: "Same passage",
      quote: "the **cloud sync** peer",
    });
    expect(asMarkdown.anchor).toEqual(asRead.anchor);
  });

  it("tells repeats apart by the text around them", async () => {
    const { ops } = setup();
    const doc = await page(ops);
    const second = await ops.thread.create({
      documentId: doc.id,
      body: "Also?",
      quote: "This is a filter",
      suffix: " too",
    });
    expect(second.anchor?.suffix).toBe(" too.");
  });

  it("refuses a quote that is not in the document", async () => {
    const { ops } = setup();
    const doc = await page(ops);
    expect(
      await code(() => ops.thread.create({ documentId: doc.id, body: "x", quote: "nowhere" })),
    ).toBe("invalid_input");
    expect((await ops.thread.list({ documentId: doc.id })).threads).toEqual([]);
  });

  it("stores an editor's anchor as given", async () => {
    const { ops } = setup();
    const doc = await page(ops);
    const anchor = { quote: "not saved yet", prefix: "", suffix: "" };
    const t = await ops.thread.create({ documentId: doc.id, body: "x", ...anchor, exact: true });
    expect(t.anchor).toEqual(anchor);
  });

  it("lists threads with replies, oldest first, open ones by default", async () => {
    const { ops } = setup();
    const doc = await page(ops);
    const a = await ops.thread.create({ documentId: doc.id, kind: "comment", body: "First" });
    const b = await ops.thread.create({ documentId: doc.id, body: "Second" });
    await ops.thread.reply({ threadId: a.id, body: "One" });
    const withReplies = await ops.thread.reply({ threadId: a.id, body: "Two" });
    expect(withReplies.replies.map((r) => r.body)).toEqual(["One", "Two"]);
    await ops.thread.resolve({ id: a.id });
    const list = async (input: object) =>
      (await ops.thread.list({ documentId: doc.id, ...input })).threads.map((t) => t.id);
    expect(await list({})).toEqual([b.id]);
    expect(await list({ state: "resolved" })).toEqual([a.id]);
    expect(await list({ state: "all" })).toEqual([a.id, b.id]);
    expect(await list({ state: "all", kind: "note" })).toEqual([b.id]);
    await ops.thread.resolve({ id: a.id, resolved: false });
    expect(await list({})).toEqual([a.id, b.id]);
  });

  it("deletes and restores a reply or a whole thread", async () => {
    const { ops } = setup();
    const doc = await page(ops);
    const t = await ops.thread.create({ documentId: doc.id, body: "Thread" });
    const reply = (await ops.thread.reply({ threadId: t.id, body: "Reply" })).replies[0]!;
    expect(await ops.thread.delete({ id: reply.id })).toEqual({ id: reply.id, threadId: t.id });
    const threads = async () => (await ops.thread.list({ documentId: doc.id })).threads;
    expect((await threads())[0]?.replies).toEqual([]);
    await ops.thread.restore({ id: reply.id });
    expect((await threads())[0]?.replies.map((r) => r.id)).toEqual([reply.id]);
    await ops.thread.delete({ id: t.id });
    expect(await threads()).toEqual([]);
    expect(await code(() => ops.thread.reply({ threadId: t.id, body: "x" }))).toBe("not_found");
    await ops.thread.restore({ id: t.id });
    expect((await threads())[0]?.replies.map((r) => r.id)).toEqual([reply.id]);
  });

  it("a reply is not a thread", async () => {
    const { ops } = setup();
    const doc = await page(ops);
    const t = await ops.thread.create({ documentId: doc.id, body: "Thread" });
    const reply = (await ops.thread.reply({ threadId: t.id, body: "Reply" })).replies[0]!;
    expect(await code(() => ops.thread.reply({ threadId: reply.id, body: "x" }))).toBe(
      "invalid_input",
    );
    expect(await code(() => ops.thread.resolve({ id: reply.id }))).toBe("invalid_input");
  });

  it("lets only the author edit, and an agent counts as its person", async () => {
    const { ops, runtime } = setup();
    const doc = await page(ops);
    const session = runtime.as(agent, "*", { sessionId: "s1" });
    const note = await session.thread.create({ documentId: doc.id, body: "From the agent" });
    expect(note.sessionId).toBe("s1");
    expect(note.createdBy).toBe("agent:claude:a1:u1");
    expect(await code(() => runtime.as(other).thread.edit({ id: note.id, body: "x" }))).toBe(
      "forbidden",
    );
    expect((await ops.thread.edit({ id: note.id, body: "Tidied" })).body).toBe("Tidied");
  });

  it("undoing an agent session removes the threads it left", async () => {
    const { ops, runtime } = setup();
    const doc = await page(ops);
    const mine = await ops.thread.create({ documentId: doc.id, body: "Mine" });
    const session = runtime.as(agent, "*", { sessionId: "s1" });
    await session.thread.create({ documentId: doc.id, body: "Note", quote: "exclude list" });
    await session.thread.reply({ threadId: mine.id, body: "Agent reply" });
    await ops.history.undoSession({ sessionId: "s1" });
    const { threads } = await ops.thread.list({ documentId: doc.id, state: "all" });
    expect(threads.map((t) => [t.id, t.replies.length])).toEqual([[mine.id, 0]]);
  });

  it("purging a document removes its threads", async () => {
    const { ops, ports } = setup();
    const doc = await page(ops);
    const keep = await ops.doc.create({ workspaceId: WS, title: "Other", markdown: "Text" });
    const t = await ops.thread.create({ documentId: doc.id, body: "Gone with the page" });
    await ops.thread.reply({ threadId: t.id, body: "Reply" });
    const kept = await ops.thread.create({ documentId: keep.id, body: "Stays" });
    await ops.doc.delete({ id: doc.id });
    expect((await ops.thread.list({ documentId: doc.id })).threads).toHaveLength(1);
    await ops.doc.purge({ id: doc.id });
    expect([...ports.state.threads.keys()]).toEqual([kept.id]);
  });

  it("emits events that name the document", async () => {
    const { ops, ports } = setup();
    const doc = await page(ops);
    const t = await ops.thread.create({ documentId: doc.id, body: "Note" });
    await ops.thread.reply({ threadId: t.id, body: "Reply" });
    await ops.thread.resolve({ id: t.id });
    const events = ports.events.published.filter((e) => e.type.startsWith("thread."));
    expect(events.map((e) => e.type)).toEqual([
      "thread.created",
      "thread.replied",
      "thread.resolved",
    ]);
    for (const e of events) expect(e.data).toMatchObject({ id: t.id, documentId: doc.id });
  });
});
