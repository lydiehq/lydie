// Every query an operation runs must use the read transaction the runtime opened for it. In the
// browser all reads share one connection, so a read made outside that transaction waits for it
// forever (doc.search and doc.unlinkedMentions did). One read worker reproduces that with the Node
// driver.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRuntime } from "@lydie/runtime";

import { openNodeStore } from "./node.ts";
import type { Store } from "./store.ts";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not finish`)), ms),
    ),
  ]);
}

test("every query operation runs inside its read transaction (one read connection)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lydie-store-tx-"));
  const store: Store = await openNodeStore({ path: join(dir, "db.sqlite"), readWorkers: 1 });
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => store.close());
  const runtime = createRuntime({ ...store.ports, actor: { type: "user", id: "u" } });
  const ws = "ws";
  const target = await runtime.ops.doc.create({ workspaceId: ws, title: "Target" });
  await runtime.ops.doc.create({ workspaceId: ws, title: "Other", markdown: "About the Target." });
  const hits = await within(
    runtime.ops.doc.search({ workspaceId: ws, query: "about" }),
    3000,
    "doc.search",
  );
  expect(hits.hits.map((h) => h.title)).toEqual(["Other"]);
  const mentions = await within(
    runtime.ops.doc.unlinkedMentions({ id: target.id }),
    3000,
    "doc.unlinkedMentions",
  );
  expect(mentions.mentions).toHaveLength(1);
  // The other queries, for good measure.
  await within(runtime.ops.doc.listTree({ workspaceId: ws }), 3000, "doc.listTree");
  await within(runtime.ops.doc.listChildren({ workspaceId: ws }), 3000, "doc.listChildren");
  await within(runtime.ops.doc.backlinks({ id: target.id }), 3000, "doc.backlinks");
  await within(runtime.ops.trash.list({ workspaceId: ws }), 3000, "trash.list");
});
