// Guards (StoreQuery.guard): a write to one document re-runs only the live queries whose
// documents changed; the guards of the others are read together, in one statement.
import { afterEach, expect, spyOn, test } from "bun:test";

import { queries } from "./queries.ts";
import type { Store } from "./store.ts";
import { closeTestStores, nextLive, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const WS = "ws";

// Counts the statements live queries run, and waits for the guard reads.
function track(store: Store) {
  const ran: string[] = [];
  let guardReads = 0;
  const waiting = new Set<() => void>();
  const getAll = store.db.getAll.bind(store.db);
  const get = store.db.get.bind(store.db);
  spyOn(store.db, "getAll").mockImplementation((async (sql: string, params?: unknown[]) => {
    ran.push(sql);
    return getAll(sql, params);
  }) as typeof store.db.getAll);
  spyOn(store.db, "get").mockImplementation((async (sql: string, params?: unknown[]) => {
    const row = await get(sql, params);
    if (sql.startsWith("SELECT (")) {
      guardReads++;
      for (const done of waiting) done();
    }
    return row;
  }) as typeof store.db.get);
  return {
    ran,
    get guardReads() {
      return guardReads;
    },
    reset() {
      ran.length = 0;
      guardReads = 0;
    },
    // The next guard read, plus time for any re-run it causes to start.
    async settled() {
      await new Promise<void>((resolve) => {
        const done = () => {
          waiting.delete(done);
          resolve();
        };
        waiting.add(done);
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
    },
  };
}

test("a body save re-runs only the live queries of the documents it changed", async () => {
  const { store, runtime } = await openTestStore();
  const folder = await runtime.ops.doc.create({ workspaceId: WS, title: "Folder" });
  const target = await runtime.ops.doc.create({ workspaceId: WS, title: "Target" });
  const note = await runtime.ops.doc.create({
    workspaceId: WS,
    parentId: folder.id,
    title: "Note",
    markdown: "See [[Target]]",
  });
  const other = await runtime.ops.doc.create({ workspaceId: WS, title: "Other", markdown: "a" });

  const open = [
    queries.getDoc(note.id, { includeBody: true }),
    queries.getDoc(target.id, { includeBody: false }),
    queries.children(WS, folder.id),
    queries.listTree(WS, { expanded: [folder.id] }),
    queries.outgoingLinks(note.id),
    queries.backlinks(target.id),
    queries.myAccess(note.id),
  ];
  const lives = open.map((q) => store.live(q as never));
  for (const live of lives) await nextLive(live, () => true);
  const reads = track(store);

  // The first guarded change after a full run runs each query once more (no mark yet).
  await runtime.ops.doc.updateBody({ id: other.id, markdown: "b" });
  await reads.settled();
  reads.reset();

  await runtime.ops.doc.updateBody({ id: other.id, markdown: "c" });
  await reads.settled();
  expect(reads.guardReads).toBe(1);
  expect(reads.ran.filter((sql) => open.some((q) => q.sql === sql))).toEqual([]);

  // A rename changes `documents`: only the tree, whose top level shows it, runs again.
  await runtime.ops.doc.rename({ id: other.id, title: "Other 2" });
  await reads.settled();
  reads.reset();
  await runtime.ops.doc.rename({ id: other.id, title: "Other 3" });
  await reads.settled();
  expect(reads.guardReads).toBe(1);
  expect(reads.ran.filter((sql) => open.some((q) => q.sql === sql))).toEqual([open[3]!.sql]);

  // The note's own save reaches its body.
  const [body] = lives;
  await runtime.ops.doc.updateBody({ id: note.id, markdown: "See [[Target]] again" });
  const rows = await nextLive(
    body!,
    (rows) => (rows[0] as { body: { markdown: string } }).body.markdown === "See [[Target]] again",
  );
  expect(rows).toHaveLength(1);
  for (const live of lives) await live.close();
});

test("guarded queries still see every change to their documents", async () => {
  const { store, runtime } = await openTestStore();
  const folder = await runtime.ops.doc.create({ workspaceId: WS, title: "Folder" });
  const child = await runtime.ops.doc.create({
    workspaceId: WS,
    parentId: folder.id,
    title: "Child",
  });
  const target = await runtime.ops.doc.create({ workspaceId: WS, title: "Target" });
  const source = await runtime.ops.doc.create({
    workspaceId: WS,
    title: "Source",
    markdown: "[[Target]]",
  });
  const top = store.live(queries.children(WS, null));
  const inFolder = store.live(queries.children(WS, folder.id));
  const links = store.live(queries.outgoingLinks(source.id));
  const doc = store.live(queries.getDoc(child.id, { includeBody: false }));
  await nextLive(top, (rows) => rows.length === 3);
  await nextLive(links, (rows) => rows[0]?.target?.title === "Target");

  // A grandchild changes the folder's count (its children's counter).
  await runtime.ops.doc.create({ workspaceId: WS, parentId: child.id, title: "Grandchild" });
  await nextLive(inFolder, (rows) => rows[0]?.childCount === 1);
  await runtime.ops.doc.create({ workspaceId: WS, parentId: folder.id, title: "Second" });
  await nextLive(top, (rows) => rows.find((r) => r.id === folder.id)?.childCount === 2);
  // Twice in a row: the second change is guarded, with the mark of the first.
  await runtime.ops.doc.rename({ id: child.id, title: "Renamed" });
  await nextLive(doc, (rows) => rows[0]?.document.title === "Renamed");
  await runtime.ops.doc.rename({ id: child.id, title: "Again" });
  await nextLive(doc, (rows) => rows[0]?.document.title === "Again");
  await nextLive(inFolder, (rows) => rows.some((r) => r.title === "Again"));
  // A target trashed and restored (its link keeps the target id).
  await runtime.ops.doc.delete({ id: target.id });
  await nextLive(links, (rows) => rows[0]?.target === null);
  await runtime.ops.doc.restore({ id: target.id });
  await nextLive(links, (rows) => rows[0]?.target?.title === "Target");
  await runtime.ops.doc.rename({ id: target.id, title: "Moved on" });
  await nextLive(links, (rows) => rows[0]?.target?.title === "Moved on");
  for (const live of [top, inFolder, links, doc]) await live.close();
});

test("outgoing links carry each target's page icon", async () => {
  const { store, runtime } = await openTestStore();
  await runtime.ops.doc.create({ workspaceId: WS, title: "Plain" });
  await runtime.ops.doc.create({ workspaceId: WS, title: "Garden", properties: { icon: "🌱" } });
  const source = await runtime.ops.doc.create({
    workspaceId: WS,
    title: "Source",
    markdown: "[[Plain]] [[Garden]] [[Missing]]",
  });
  const links = await store.query(queries.outgoingLinks(source.id));
  expect(links.map((l) => l.target?.icon)).toEqual([null, "🌱", undefined]);
  // The operation returns the same rows.
  expect((await runtime.ops.doc.outgoingLinks({ id: source.id })).links).toEqual(links);
});
