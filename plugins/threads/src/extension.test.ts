import { expect, test } from "bun:test";

import { EditorState, getLydieSchema } from "@lydie/plugin-api/editor";
import type { Transaction } from "@lydie/plugin-api/editor";

import { applyThreads, threadsKey, threadsState } from "./extension.ts";
import type { Marked, ThreadsMeta } from "./extension.ts";

test("a passage not found is looked for again on a retry, not on every edit", () => {
  const schema = getLydieSchema();
  let state = EditorState.create({
    doc: schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text("The quick brown fox")),
    ]),
  });
  // No plugin in this state: threadsState gives the empty one.
  let threads = threadsState(state);
  const apply = (tr: Transaction) => {
    state = state.apply(tr);
    threads = applyThreads(tr, threads, state.doc);
  };
  const marked: Marked[] = [
    { id: "found", kind: "comment", anchor: { quote: "quick", prefix: "The ", suffix: " brown" } },
    { id: "gone", kind: "comment", anchor: { quote: "lazy dog", prefix: "", suffix: "" } },
  ];
  apply(state.tr.setMeta(threadsKey, { threads: marked } satisfies ThreadsMeta));
  expect(threads.ranges.get("found")).toEqual({ from: 5, to: 10 });
  expect([...threads.missing]).toEqual(["gone"]);

  // The passage comes back, but an edit does not look for it: the thread stays missing.
  apply(state.tr.insertText(" jumps over the lazy dog", state.doc.content.size - 1));
  expect(threads.ranges.has("gone")).toBe(false);
  // The found one follows the edit through the mapping.
  apply(state.tr.insertText("Oh. ", 1));
  expect(threads.ranges.get("found")).toEqual({ from: 9, to: 14 });

  apply(state.tr.setMeta(threadsKey, { retry: true } satisfies ThreadsMeta));
  const range = threads.ranges.get("gone")!;
  expect(state.doc.textBetween(range.from, range.to)).toBe("lazy dog");
  expect(threads.missing.size).toBe(0);
});
