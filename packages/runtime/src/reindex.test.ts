import { expect, it } from "bun:test";

import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";
import { extract } from "./text.ts";
import type { Extract } from "./text.ts";

const actor = { type: "user", id: "u" } as const;
const ws = "ws";

// An "older extractor" that saw no links and no blocks.
const blind: Extract = (markdown) => ({ ...extract(markdown), links: [], blocks: [] });

async function seed() {
  const ports = createMemoryPorts();
  const old = createRuntime({ ...ports, actor, extract: blind });
  const target = await old.ops.doc.create({
    workspaceId: ws,
    title: "Target",
    markdown: "Back to [[Source]]\n",
  });
  const source = await old.ops.doc.create({
    workspaceId: ws,
    title: "Source",
    markdown: "See [[Target]].\n\nA quote ^q1\n",
  });
  // Without a body: nothing to extract.
  await old.ops.doc.create({ workspaceId: ws, title: "No body" });
  return { ports, target, source };
}

const linksFrom = (ports: ReturnType<typeof createMemoryPorts>, id: string) =>
  [...ports.state.links.values()].filter((l) => l.sourceId === id);

it("re-extracts links and blocks with the current extractor, as derived rows only", async () => {
  const { ports, target, source } = await seed();
  expect(linksFrom(ports, source.id)).toHaveLength(0);
  const oplog = ports.state.oplog.length;
  const published = ports.events.published.length;

  const runtime = createRuntime({ ...ports, actor, extract });
  const result = await runtime.reindexBodies(ws, { batchSize: 1 });

  expect(result.documents).toBe(2);
  expect(linksFrom(ports, source.id).map((l) => l.targetId)).toEqual([target.id]);
  expect(linksFrom(ports, target.id).map((l) => l.targetId)).toEqual([source.id]);
  expect(ports.state.blocks.get(source.id)?.map((b) => b.blockId)).toEqual(["q1"]);
  expect(ports.state.oplog).toHaveLength(oplog);
  expect(ports.events.published).toHaveLength(published);
  expect(runtime.history.canUndo()).toBe(false);
});

it("is idempotent", async () => {
  const { ports, source } = await seed();
  const runtime = createRuntime({ ...ports, actor, extract });
  await runtime.reindexBodies(ws);
  const first = linksFrom(ports, source.id);
  await runtime.reindexBodies(ws);
  expect(linksFrom(ports, source.id)).toEqual(first);
});

it("leaves a body saved while it ran to that save", async () => {
  const { ports, source } = await seed();
  const runtime = createRuntime({
    ...ports,
    actor,
    // Simulates a save landing between the read and the write: the first extraction edits the body.
    extract: (markdown) => {
      if (markdown.includes("[[Target]]")) {
        void ports.db.write((tx) =>
          tx.bodies.put(source.id, ws, { markdown: "Rewritten", version: "v-new" }, "now"),
        );
      }
      return extract(markdown);
    },
  });
  const result = await runtime.reindexBodies(ws);
  expect(result.documents).toBe(1);
  expect(linksFrom(ports, source.id)).toHaveLength(0);
});
