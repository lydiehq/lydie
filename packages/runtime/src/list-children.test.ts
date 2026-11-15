import { expect, it } from "bun:test";

import { createMemoryPorts } from "./memory/index.ts";
import type { Db } from "./ports.ts";
import { createRuntime } from "./runtime.ts";

// Ports without docs.childEntries must not read once per child.
it("doc.listChildren without childEntries reads a constant number of times", async () => {
  const ports = createMemoryPorts();
  const calls = { children: 0, tree: 0 };
  const db: Db = {
    write: (fn) => ports.db.write(fn),
    read: (fn) =>
      ports.db.read((tx) =>
        fn({
          ...tx,
          docs: {
            ...tx.docs,
            childEntries: undefined,
            children: (...args) => (calls.children++, tx.docs.children(...args)),
            tree: (...args) => (calls.tree++, tx.docs.tree(...args)),
          },
        }),
      ),
  };
  const runtime = createRuntime({ ...ports, db, actor: { type: "user", id: "u" } });
  const ws = "ws";
  const parent = await runtime.ops.doc.create({ workspaceId: ws, title: "P" });
  for (let i = 0; i < 20; i++) {
    const child = await runtime.ops.doc.create({
      workspaceId: ws,
      title: `C${i}`,
      parentId: parent.id,
    });
    for (let j = 0; j < i % 3; j++) {
      await runtime.ops.doc.create({ workspaceId: ws, title: `G${i}.${j}`, parentId: child.id });
    }
  }
  calls.children = 0;
  calls.tree = 0;
  const { entries } = await runtime.ops.doc.listChildren({ workspaceId: ws, parentId: parent.id });
  expect(entries).toHaveLength(20);
  expect(entries.map((e) => e.childCount)).toEqual(Array.from({ length: 20 }, (_, i) => i % 3));
  expect(calls).toEqual({ children: 1, tree: 1 });
  const top = await runtime.ops.doc.listChildren({ workspaceId: ws });
  expect(top.entries.map((e) => [e.title, e.childCount])).toEqual([["P", 20]]);
});
