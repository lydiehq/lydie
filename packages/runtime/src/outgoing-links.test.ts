import { expect, it } from "bun:test";

import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";

// Ports without links.outgoing (such as the memory ports) build it from links.from.
it("doc.outgoingLinks resolves each link to its live target (LYD-252)", async () => {
  const ports = createMemoryPorts();
  const { ops } = createRuntime({ ...ports, actor: { type: "user", id: "u" } });
  const ws = "ws";
  await ops.doc.create({ workspaceId: ws, title: "Target" });
  const other = await ops.doc.create({ workspaceId: ws, title: "Other" });
  const source = await ops.doc.create({
    workspaceId: ws,
    title: "Source",
    properties: { related: "[[Other]]" },
    markdown: "See [[Target#Intro]], [[Target#^b1]] and [[Missing]].",
  });
  await ops.doc.delete({ id: other.id });
  const { links } = await ops.doc.outgoingLinks({ id: source.id });
  expect(
    links.map((l) => [
      l.targetRef,
      l.targetHeading,
      l.targetBlockId,
      l.sourceProperty,
      l.target?.title ?? null,
    ]),
  ).toEqual([
    ["Target", "Intro", null, null, "Target"],
    ["Target", null, "b1", null, "Target"],
    ["Missing", null, null, null, null],
    ["Other", null, null, "related", null],
  ]);
});

it("doc.outgoingLinks gives each target's page icon", async () => {
  const { ops } = createRuntime({ ...createMemoryPorts(), actor: { type: "user", id: "u" } });
  await ops.doc.create({ workspaceId: "ws", title: "Plain" });
  await ops.doc.create({ workspaceId: "ws", title: "Garden", properties: { icon: "🌱" } });
  const source = await ops.doc.create({
    workspaceId: "ws",
    title: "Source",
    markdown: "[[Plain]] [[Garden]] [[Missing]]",
  });
  const { links } = await ops.doc.outgoingLinks({ id: source.id });
  expect(links.map((l) => l.target?.icon)).toEqual([null, "🌱", undefined]);
});
