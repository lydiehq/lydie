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
