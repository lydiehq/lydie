// What a body save does while it holds the write lock (in the browser, the one connection).
import { expect, it } from "bun:test";

import { createMemoryPorts } from "./memory/index.ts";
import type { Db } from "./ports.ts";
import { createRuntime } from "./runtime.ts";
import { extract as defaultExtract } from "./text.ts";

function setup() {
  const ports = createMemoryPorts();
  let inWrite = 0;
  const calls = { extractInWrite: 0, extractOutside: 0, linkWrites: 0 };
  const db: Db = {
    read: (fn) => ports.db.read(fn),
    write: (fn) =>
      ports.db.write(async (tx) => {
        inWrite++;
        try {
          return await fn({
            ...tx,
            links: {
              ...tx.links,
              replaceFrom: (...args) => (calls.linkWrites++, tx.links.replaceFrom(...args)),
            },
          });
        } finally {
          inWrite--;
        }
      }),
  };
  const runtime = createRuntime({
    ...ports,
    db,
    actor: { type: "user", id: "u" },
    extract: (markdown) => {
      if (inWrite > 0) calls.extractInWrite++;
      else calls.extractOutside++;
      return defaultExtract(markdown);
    },
  });
  return { runtime, calls };
}

const big = (extra = "") =>
  `${Array.from({ length: 100 }, (_, i) => `Paragraph ${i} about [[Target]].`).join("\n\n")}${extra}`;

it("extracts a large body before taking the write lock", async () => {
  const { runtime, calls } = setup();
  const doc = await runtime.ops.doc.create({ workspaceId: "ws", title: "Doc", markdown: big() });
  await runtime.ops.doc.updateBody({ id: doc.id, markdown: big("\n\nMore.") });
  expect(calls.extractInWrite).toBe(0);
  expect(calls.extractOutside).toBe(2);
  // Edits are applied to the stored body inside the transaction: extracted there.
  await runtime.ops.doc.updateBody({
    id: doc.id,
    edits: [{ oldStr: "More.", newStr: "Less.", replaceAll: false }],
  });
  expect(calls.extractInWrite).toBe(1);
});

it("marks a document edited at most once a minute per author", async () => {
  const ports = createMemoryPorts();
  let now = Date.parse("2026-11-12T10:00:00.000Z");
  const clock = { now: () => new Date(now) };
  const runtime = createRuntime({ ...ports, clock, actor: { type: "user", id: "u" } });
  const other = runtime.as({ type: "user", id: "v" });
  const doc = await runtime.ops.doc.create({ workspaceId: "ws", title: "Doc", markdown: "a" });
  const stamp = async () => {
    const { document } = await runtime.ops.doc.get({ id: doc.id });
    return [document.updatedAt, document.updatedBy];
  };
  now += 30_000;
  const saved = await runtime.ops.doc.updateBody({ id: doc.id, markdown: "b" });
  expect(saved.document.updatedAt).toBe("2026-11-12T10:00:00.000Z");
  expect(await stamp()).toEqual(["2026-11-12T10:00:00.000Z", "u"]);
  // Another author stamps at once.
  now += 1_000;
  await other.doc.updateBody({ id: doc.id, markdown: "c" });
  expect(await stamp()).toEqual(["2026-11-12T10:00:31.000Z", "v"]);
  now += 1_000;
  await runtime.ops.doc.updateBody({ id: doc.id, markdown: "d" });
  expect(await stamp()).toEqual(["2026-11-12T10:00:32.000Z", "u"]);
  // The same author a minute later.
  now += 60_000;
  const later = await runtime.ops.doc.updateBody({ id: doc.id, markdown: "e" });
  expect(later.document.updatedAt).toBe("2026-11-12T10:01:32.000Z");
  expect(await stamp()).toEqual(["2026-11-12T10:01:32.000Z", "u"]);
});

it("keeps a link's target while it is written as before", async () => {
  const ports = createMemoryPorts();
  const runtime = createRuntime({ ...ports, actor: { type: "user", id: "u" } });
  const ops = runtime.ops;
  const away = await ops.doc.create({ workspaceId: "ws", title: "Away" });
  const here = await ops.doc.create({ workspaceId: "ws", title: "Here" });
  const far = await ops.doc.create({ workspaceId: "ws", title: "Plan", parentId: away.id });
  const doc = await ops.doc.create({
    workspaceId: "ws",
    title: "Doc",
    parentId: here.id,
    markdown: "See [[Plan]] and [./Plan](./Plan).",
  });
  const targets = async () =>
    (await ops.doc.outgoingLinks({ id: doc.id })).links.map((l) => [l.targetRef, l.target?.id]);
  expect(await targets()).toEqual([
    ["Plan", far.id],
    ["./Plan", far.id],
  ]);
  // A better match appears (in the source's own folder): a save that keeps the wikilink as it
  // was keeps its target; the relative link follows the folder.
  const near = await ops.doc.create({ workspaceId: "ws", title: "Plan", parentId: here.id });
  await ops.doc.updateBody({ id: doc.id, markdown: "See [[Plan]] and [./Plan](./Plan). More." });
  expect(await targets()).toEqual([
    ["Plan", far.id],
    ["./Plan", near.id],
  ]);
  // Written differently, it resolves again.
  await ops.doc.updateBody({ id: doc.id, markdown: "See [[plan]]." });
  expect(await targets()).toEqual([["plan", near.id]]);
  // A target that went to the trash is not kept.
  await ops.doc.delete({ id: near.id });
  await ops.doc.updateBody({ id: doc.id, markdown: "See [[plan]]. Again." });
  expect(await targets()).toEqual([["plan", far.id]]);
});

it("looks up each distinct link key of a save once", async () => {
  const ports = createMemoryPorts();
  const lookups: string[][] = [];
  const db: Db = {
    read: (fn) => ports.db.read(fn),
    write: (fn) =>
      ports.db.write((tx) =>
        fn({
          ...tx,
          docs: {
            ...tx.docs,
            findAllByLinkKeys: (ws, keys) => (
              lookups.push([...keys]),
              tx.docs.findAllByLinkKeys!(ws, keys)
            ),
          },
        }),
      ),
  };
  const runtime = createRuntime({ ...ports, db, actor: { type: "user", id: "u" } });
  await runtime.ops.doc.create({ workspaceId: "ws", title: "A" });
  await runtime.ops.doc.create({
    workspaceId: "ws",
    title: "Doc",
    markdown: "[[A]] [[A#Heading]] [[B]] ![[a]] [[Folder/A]]",
  });
  expect(lookups).toEqual([["a", "b"]]);
});

it("does not rewrite links a save leaves unchanged", async () => {
  const { runtime, calls } = setup();
  await runtime.ops.doc.create({ workspaceId: "ws", title: "Target" });
  const doc = await runtime.ops.doc.create({ workspaceId: "ws", title: "Doc", markdown: big() });
  calls.linkWrites = 0;
  await runtime.ops.doc.updateBody({ id: doc.id, markdown: big("\n\nTyping more text.") });
  expect(calls.linkWrites).toBe(0);
  await runtime.ops.doc.updateBody({ id: doc.id, markdown: big("\n\nNow [[Other]].") });
  expect(calls.linkWrites).toBe(1);
  const { links } = await runtime.ops.doc.outgoingLinks({ id: doc.id });
  expect(links.filter((l) => l.targetRef === "Other")).toHaveLength(1);
  expect(links.filter((l) => l.target?.title === "Target").length).toBeGreaterThan(0);
});
