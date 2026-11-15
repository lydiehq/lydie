// `listTree` with `expanded`: the top level always, and the children of the listed documents only.
import { afterEach, expect, test } from "bun:test";

import { queries } from "./queries.ts";
import { closeTestStores, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const WS = "ws";

test("expanded: [] is the top level only; listed documents open one level each", async () => {
  const { runtime, store } = await openTestStore();
  const a = await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
  const a1 = await runtime.ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
  await runtime.ops.doc.create({ workspaceId: WS, title: "A1x", parentId: a1.id });
  await runtime.ops.doc.create({ workspaceId: WS, title: "B" });
  const gone = await runtime.ops.doc.create({ workspaceId: WS, title: "C" });
  await runtime.ops.doc.delete({ id: gone.id });

  const titles = async (options: Parameters<Store["listTree"]>[1]) =>
    (await store.listTree(WS, options)).map((e) => `${e.depth}:${e.title}`);
  type Store = typeof store;

  expect(await titles({ expanded: [] })).toEqual(["0:A", "0:B"]);
  expect(await titles({ expanded: [a.id] })).toEqual(["0:A", "1:A1", "0:B"]);
  expect(await titles({ expanded: [a.id, a1.id] })).toEqual(["0:A", "1:A1", "2:A1x", "0:B"]);
  // A child's expansion without its parent's shows nothing extra (it is not visible).
  expect(await titles({ expanded: [a1.id] })).toEqual(["0:A", "0:B"]);
  expect(await titles({ expanded: [], includeDeleted: true })).toEqual(["0:A", "0:B", "0:C"]);
  expect(await titles({ rootId: a.id, expanded: [] })).toEqual(["0:A1"]);
  expect(await titles({})).toEqual(["0:A", "1:A1", "2:A1x", "0:B"]);
  // The same through the watched form the UI uses.
  const live = store.live((await import("./queries.ts")).queries.listTree(WS, { expanded: [] }));
  await new Promise<void>((resolve) => {
    const check = () => {
      if (!live.state.isLoading) resolve();
    };
    live.subscribe(check);
    check();
  });
  expect(live.state.data.map((e) => e.title)).toEqual(["A", "B"]);
  await live.close();
});

test("tree rows carry their space; hosted trees filter the top level by space", async () => {
  const { runtime, store } = await openTestStore("synced");
  const team = await runtime.ops.doc.create({ workspaceId: WS, title: "Team page" });
  const child = await runtime.ops.doc.create({
    workspaceId: WS,
    title: "Child",
    parentId: team.id,
  });
  const mine = await runtime.ops.doc.create({ workspaceId: WS, title: "My page" });
  // As the hosted workspace syncs them: written to the internal table, not uploaded.
  const setSpace = (id: string, space: Record<string, string | null>) =>
    store.db.execute(
      `UPDATE ps_data__documents SET data = json_set(data, '$.teamspace_id', ?, '$.private_owner_id', ?) WHERE id = ?`,
      [space.teamspace_id ?? null, space.private_owner_id ?? null, id],
    );
  await setSpace(team.id, { teamspace_id: "ts1" });
  await setSpace(child.id, { teamspace_id: "ts1" });
  await setSpace(mine.id, { private_owner_id: "u1" });

  const space = (e: {
    title: string;
    teamspaceId?: string | null;
    privateOwnerId?: string | null;
  }) => `${e.title}:${e.teamspaceId ?? "-"}:${e.privateOwnerId ?? "-"}`;
  expect((await store.query(queries.children(WS, null))).map(space)).toEqual([
    "Team page:ts1:-",
    "My page:-:u1",
  ]);
  expect(
    (await store.query(queries.children(WS, null, { teamspaceId: "ts1" }))).map(space),
  ).toEqual(["Team page:ts1:-"]);
  expect(
    (
      await store.query(queries.children(WS, null, { teamspaceId: null, privateOwnerId: "u1" }))
    ).map(space),
  ).toEqual(["My page:-:u1"]);
  // The virtualised tree: one space's top level, its subtree as usual.
  expect(
    (await store.query(queries.listTree(WS, { teamspaceId: "ts1", expanded: [team.id] }))).map(
      (e) => `${e.depth}:${space(e)}`,
    ),
  ).toEqual(["0:Team page:ts1:-", "1:Child:ts1:-"]);
  expect((await store.query(queries.listTree(WS, { privateOwnerId: "u1" }))).map(space)).toEqual([
    "My page:-:u1",
  ]);
  expect(await store.db.getAll("SELECT * FROM ps_crud WHERE data LIKE '%teamspace%'")).toEqual([]);
});

test("tree rows have no space locally", async () => {
  const { runtime, store } = await openTestStore();
  await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
  const [row] = await store.query(queries.children(WS, null));
  expect(row).toMatchObject({ teamspaceId: null, privateOwnerId: null });
  const [entry] = await store.listTree(WS);
  expect(entry).toMatchObject({ teamspaceId: null, privateOwnerId: null });
});
