import { describe, expect, it } from "bun:test";

import { docUpdateBody, isLydieError } from "@lydie/contract";

const databaseUpdateBodyInput = docUpdateBody.input;

import { bodyInverse, inverseEdit } from "./handlers/doc.ts";
import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";
import { applyEdits } from "./text.ts";

const big = (seed: string) =>
  Array.from({ length: 200 }, (_, i) => `Line ${i} of ${seed}: lorem ipsum dolor.`).join("\n");

describe("body inverses (LYD-170)", () => {
  it("restores the previous body exactly with one small edit", () => {
    const cases: [string, string][] = [
      [big("a"), big("a").replace("Line 50 of a", "Line fifty of a")],
      [big("a"), big("a") + "\nappended"],
      [big("a"), "prepended\n" + big("a")],
      [big("a"), big("a").replace("Line 120 of a: lorem ipsum dolor.\n", "")],
      // A change inside repeated text needs context to be unique.
      ["x".repeat(3000), "x".repeat(1500) + "y" + "x".repeat(1500)],
    ];
    for (const [previous, next] of cases) {
      const edit = inverseEdit(previous, next)!;
      expect(applyEdits(next, [{ ...edit, replaceAll: false }])).toEqual({
        markdown: previous,
        warnings: [],
      });
      expect(edit.oldStr.length).toBeLessThan(previous.length / 4);
    }
  });

  it("keeps the whole body when it is small or the change is large", () => {
    expect(bodyInverse("d", "short", "shorter", "v")).toEqual({ id: "d", markdown: "short" });
    expect(bodyInverse("d", big("a"), "", "v")).toEqual({ id: "d", markdown: big("a") });
    expect(bodyInverse("d", big("a"), big("b"), "v")).toEqual({ id: "d", markdown: big("a") });
    expect(bodyInverse("d", big("a"), big("a") + "!", "v")).toMatchObject({
      id: "d",
      expectedVersion: "v",
      edits: [{ oldStr: expect.any(String) }],
    });
  });
});

describe("undo of large body edits", () => {
  it("undoes and redoes exactly, journaling an edit instead of the body", async () => {
    const ports = createMemoryPorts();
    const runtime = createRuntime({ ...ports, actor: { type: "user", id: "u1" } });
    const doc = await runtime.ops.doc.create({
      workspaceId: "ws",
      title: "Big",
      markdown: big("a"),
    });
    runtime.history.clear();
    const edited = big("a").replace("Line 10 of a", "Line ten of a");
    await runtime.ops.doc.updateBody({ id: doc.id, markdown: edited });
    const entry = ports.state.history.find((h) => h.operation === "doc.updateBody")!;
    expect(JSON.stringify(entry.inverse).length).toBeLessThan(500);
    // The journal holds the change as an edit too, not the new body (LYD-244); replayed on the
    // previous body it gives the same result. The upload queue keeps the real input.
    expect(JSON.stringify(entry.input).length).toBeLessThan(500);
    const forward = entry.input as {
      edits: { oldStr: string; newStr: string; replaceAll: false }[];
    };
    expect(typeof (entry.input as { expectedVersion?: unknown }).expectedVersion).toBe("string");
    expect(applyEdits(big("a"), forward.edits).markdown).toBe(edited);
    expect(databaseUpdateBodyInput.safeParse(entry.input).success).toBe(true);
    const queued = ports.state.oplog.find((e) => e.operation === "doc.updateBody")!;
    expect(queued.input).toEqual({ id: doc.id, markdown: edited });
    await runtime.history.undo();
    expect((await runtime.ops.doc.get({ id: doc.id })).body?.markdown).toBe(big("a"));
    await runtime.history.redo();
    expect((await runtime.ops.doc.get({ id: doc.id })).body?.markdown).toBe(edited);

    // Applied to a body that changed since, the inverse is a conflict, not a wrong edit.
    const inverse = entry.inverse![0]!.input as Record<string, unknown>;
    await runtime.ops.doc.updateBody({ id: doc.id, markdown: `${edited}\nmore` });
    let error: unknown;
    try {
      await runtime.execute("doc.updateBody", inverse as never);
    } catch (e) {
      error = e;
    }
    expect(isLydieError(error) && error.code).toBe("conflict");
  });
});
