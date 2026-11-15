// `recent`: live documents of one workspace, most recently changed first.
import { afterEach, expect, test } from "bun:test";

import { createRuntime } from "@lydie/runtime";

import { queries } from "./queries.ts";
import { closeTestStores, nextLive, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

test("lists live documents by last change, newest first, within the limit", async () => {
  const { store } = await openTestStore();
  let minute = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 10, 13, 9, minute++)) };
  const runtime = createRuntime({ ...store.ports, actor: { type: "user", id: "u1" }, clock });
  const a = await runtime.ops.doc.create({ workspaceId: "ws", title: "A" });
  const b = await runtime.ops.doc.create({ workspaceId: "ws", title: "B" });
  const c = await runtime.ops.doc.create({ workspaceId: "ws", title: "C" });
  await runtime.ops.doc.create({ workspaceId: "other", title: "Elsewhere" });
  const gone = await runtime.ops.doc.create({ workspaceId: "ws", title: "Gone" });
  await runtime.ops.doc.delete({ id: gone.id });
  // Editing a body counts as a change.
  await runtime.ops.doc.updateBody({ id: a.id, markdown: "Edited" });

  const titles = async (limit?: number) =>
    (await store.query(queries.recent("ws", limit === undefined ? {} : { limit }))).map(
      (d) => d.title,
    );
  expect(await titles()).toEqual(["A", "C", "B"]);
  expect(await titles(2)).toEqual(["A", "C"]);

  const live = store.live(queries.recent("ws", { limit: 2 }));
  await nextLive(live, (rows) => rows.length === 2);
  await runtime.ops.doc.rename({ id: b.id, title: "B2" });
  const rows = await nextLive(live, (rows) => rows[0]?.id === b.id);
  expect(rows.map((d) => d.title)).toEqual(["B2", "A"]);
  expect(rows.some((d) => d.id === c.id)).toBe(false);
  await live.close();
});
