// The bulk writes a folder index uses give the same rows as their one-at-a-time versions.
import { afterEach, expect, test } from "bun:test";

import type { Document } from "@lydie/contract";
import type { DbTx, LinkRow } from "@lydie/runtime";

import { closeTestStores, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const doc = (i: number): Document => ({
  id: `00000000-0000-7000-8000-${String(i).padStart(12, "0")}`,
  workspaceId: "ws",
  parentId: null,
  title: `Doc ${i}`,
  sortKey: `a${i}`,
  properties: i % 2 ? { tags: ["x"], n: i } : {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  createdBy: i % 3 ? "u" : null,
  updatedBy: null,
});
const link = (source: string, n: number): LinkRow => ({
  id: `${source}-L${n}`,
  workspaceId: "ws",
  sourceId: source,
  sourceBlockId: n % 2 ? "b1" : null,
  targetId: null,
  targetRef: `Target ${n}`,
  targetKey: `target ${n}`,
  targetHeading: null,
  targetBlockId: null,
  kind: "link",
  syntax: "wikilink",
  sourceProperty: n % 3 ? null : "rel",
});

async function snapshot(tx: DbTx) {
  const out: unknown[] = [];
  for (let i = 0; i < 6; i++) {
    const id = doc(i).id;
    out.push(await tx.docs.get(id), await tx.bodies.get(id), await tx.links.from?.(id));
    out.push(await tx.blocks?.list(id));
  }
  return out;
}

test("insertMany, putMany, replaceFromMany and replaceForMany match the single writes", async () => {
  const one = await openTestStore();
  const many = await openTestStore();
  const docs = Array.from({ length: 6 }, (_, i) => doc(i));
  const body = (i: number, v: string) => ({ markdown: `Body ${i} ${v}`, version: `v${i}${v}` });
  const blocks = (i: number) => [
    { docId: docs[i]!.id, blockId: "b1", type: "paragraph", text: `t${i}`, order: 0 },
    { docId: docs[i]!.id, blockId: "b1", type: "paragraph", text: "duplicate id", order: 1 },
    { docId: docs[i]!.id, blockId: "b2", type: "heading", text: `h${i}`, order: 2 },
  ];
  await one.store.ports.db.write(async (tx) => {
    for (const d of docs) await tx.docs.insert(d);
    for (const [i, d] of docs.entries()) {
      if (i < 3) await tx.bodies.put(d.id, "ws", body(i, "old"), d.updatedAt);
    }
    for (const [i, d] of docs.entries()) {
      await tx.bodies.put(d.id, "ws", body(i, "new"), d.updatedAt);
      await tx.links.replaceFrom(d.id, [link(d.id, i), link(d.id, i + 1)]);
      await tx.blocks!.replaceFor(d.id, "ws", blocks(i));
    }
  });
  await many.store.ports.db.write(async (tx) => {
    await tx.docs.insertMany!(docs);
    // Some bodies exist already: they are updated, the rest inserted.
    await tx.bodies.putMany!(
      docs.slice(0, 3).map((d, i) => ({
        id: d.id,
        workspaceId: "ws",
        body: body(i, "old"),
        updatedAt: d.updatedAt,
      })),
    );
    await tx.links.replaceFromMany!(docs.map((d) => ({ sourceId: d.id, links: [link(d.id, 99)] })));
    await tx.bodies.putMany!(
      docs.map((d, i) => ({
        id: d.id,
        workspaceId: "ws",
        body: body(i, "new"),
        updatedAt: d.updatedAt,
      })),
    );
    await tx.links.replaceFromMany!(
      docs.map((d, i) => ({ sourceId: d.id, links: [link(d.id, i), link(d.id, i + 1)] })),
    );
    await tx.blocks!.replaceForMany!(
      docs.map((d, i) => ({ docId: d.id, workspaceId: "ws", blocks: blocks(i) })),
    );
  });
  const a = await one.store.ports.db.write((tx) => snapshot(tx));
  const b = await many.store.ports.db.write((tx) => snapshot(tx));
  expect(b).toEqual(a);
  // Derived tables follow (search, doc_props).
  expect((await many.store.search("ws", "new")).length).toBe(6);
});

test("resolveDanglingMany resolves like resolveDangling in order; fileIndex bulk writes", async () => {
  const { store } = await openTestStore();
  const [a, b, c] = [doc(1), doc(2), doc(3)];
  await store.ports.db.write(async (tx) => {
    await tx.docs.insertMany!([a, b, c]);
    await tx.links.replaceFrom(a.id, [
      { ...link(a.id, 1), targetKey: "dune" },
      { ...link(a.id, 2), targetKey: "arrakis" },
      { ...link(a.id, 3), targetKey: "other" },
    ]);
    // Two targets with the same key: the first one wins.
    await tx.links.resolveDanglingMany!("ws", [
      { key: "dune", targetId: b.id },
      { key: "dune", targetId: c.id },
      { key: "arrakis", targetId: c.id },
    ]);
  });
  const links = await store.ports.db.read(async (tx) => (await tx.links.from!(a.id))!);
  expect(Object.fromEntries(links.map((l) => [l.targetKey, l.targetId]))).toEqual({
    dune: b.id,
    arrakis: c.id,
    other: null,
  });

  const entry = (id: string, path: string) => ({
    id,
    workspaceId: "ws",
    path,
    mtime: 1,
    size: 2,
    hash: "h",
    lca: null,
    indexedAt: "2026-01-01T00:00:00.000Z",
  });
  await store.fileIndex.put(entry("x", "old.md"));
  await store.fileIndex.putMany([entry("x", "X.md"), entry("y", "Y.md"), entry("z", "Z.md")]);
  expect((await store.fileIndex.list("ws")).map((e) => e.path)).toEqual(["X.md", "Y.md", "Z.md"]);
  await store.fileIndex.removeMany(["x", "z"]);
  expect((await store.fileIndex.list("ws")).map((e) => e.id)).toEqual(["y"]);
});
