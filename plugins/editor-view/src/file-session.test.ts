// What a folder window sends main while typing: the blocks that changed since the last update.
import { describe, expect, test } from "bun:test";

import { getLydieSchema } from "@lydie/plugin-api/editor";

import { patchFrom } from "./file-session.tsx";

const schema = getLydieSchema();
const para = (text: string) => schema.node("paragraph", null, [schema.text(text)]);
const docOf = (...blocks: ReturnType<typeof para>[]) => schema.node("doc", null, blocks);

describe("document patches", () => {
  const sent = docOf(para("one"), para("two"), para("three"));

  test("send only the blocks that are not the nodes main has", () => {
    // An edit replaces its block's node; the others stay the same objects.
    const edited = sent.copy(sent.content.replaceChild(1, para("two, edited")));
    expect(patchFrom({ seq: 4, doc: sent }, edited)).toEqual({
      type: "patch",
      base: 4,
      from: 1,
      to: 2,
      content: [para("two, edited").toJSON()],
      count: 3,
    });
  });

  test("cover insertions, deletions and no change", () => {
    const inserted = docOf(sent.child(0), para("new"), sent.child(1), sent.child(2));
    expect(patchFrom({ seq: 1, doc: sent }, inserted)).toMatchObject({
      from: 1,
      to: 1,
      content: [para("new").toJSON()],
      count: 4,
    });
    const deleted = docOf(sent.child(0), sent.child(2));
    expect(patchFrom({ seq: 1, doc: sent }, deleted)).toMatchObject({
      from: 1,
      to: 2,
      content: [],
      count: 2,
    });
    expect(patchFrom({ seq: 1, doc: sent }, sent)).toMatchObject({ from: 3, to: 3, content: [] });
  });

  test("a document rebuilt from scratch is sent whole", () => {
    const rebuilt = docOf(para("one"), para("two"), para("three"));
    expect(patchFrom({ seq: 1, doc: sent }, rebuilt)).toMatchObject({ from: 0, to: 3, count: 3 });
  });
});
