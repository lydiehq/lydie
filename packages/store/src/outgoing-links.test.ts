// `outgoingLinks` (LYD-252): the links of one document as written, each with its live target.
import { afterEach, expect, test } from "bun:test";

import { queries } from "./queries.ts";
import { closeTestStores, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const WS = "ws";

test("resolves each link to its live target, live", async () => {
  const { runtime, store } = await openTestStore();
  const target = await runtime.ops.doc.create({ workspaceId: WS, title: "Target" });
  const other = await runtime.ops.doc.create({ workspaceId: WS, title: "Other" });
  const source = await runtime.ops.doc.create({
    workspaceId: WS,
    title: "Source",
    properties: { related: "[[Other]]" },
    markdown: "See [[Target#Intro]], [[Target#^b1]] and [[Missing]].",
  });
  const shape = (links: Awaited<ReturnType<typeof store.outgoingLinks>>) =>
    links.map((l) => [
      l.targetRef,
      l.targetHeading,
      l.targetBlockId,
      l.sourceProperty,
      l.target?.title ?? null,
    ]);

  expect(shape(await store.outgoingLinks(source.id))).toEqual([
    ["Target", "Intro", null, null, "Target"],
    ["Target", null, "b1", null, "Target"],
    ["Missing", null, null, null, null],
    ["Other", null, null, "related", "Other"],
  ]);
  // The operation returns the same.
  const op = await runtime.ops.doc.outgoingLinks({ id: source.id });
  expect(op.links).toEqual(await store.outgoingLinks(source.id));

  const live = store.live(queries.outgoingLinks(source.id));
  const next = (pred: (titles: (string | null)[]) => boolean) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (!live.state.isLoading && pred(live.state.data.map((l) => l.target?.title ?? null))) {
          resolve();
        }
      };
      live.subscribe(check);
      check();
    });
  await next((t) => t.length === 4);
  // Renaming a target, trashing one and creating the missing one all show up.
  await runtime.ops.doc.rename({ id: target.id, title: "Renamed" });
  await next((t) => t[0] === "Renamed");
  await runtime.ops.doc.delete({ id: other.id });
  await next((t) => t[3] === null);
  await runtime.ops.doc.create({ workspaceId: WS, title: "Missing" });
  await next((t) => t[2] === "Missing");
  await live.close();
});
