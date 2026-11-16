import { expect, test } from "bun:test";

import { EditorState, getLydieSchema } from "@lydie/plugin-api/editor";
import type { Editor } from "@lydie/plugin-api/editor";

import { headingsOf } from "./index.tsx";

test("typing above a heading leaves the outline as it was", () => {
  const schema = getLydieSchema();
  let state = EditorState.create({
    doc: schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text("Intro")),
      schema.nodes.heading!.create({ level: 1 }, schema.text("One ^block-1")),
      schema.nodes.heading!.create({ level: 2 }, schema.text("Two")),
    ]),
  });
  const editor = () => ({ state }) as unknown as Editor;
  const before = headingsOf(editor());
  expect(before).toEqual([
    { level: 1, text: "One" },
    { level: 2, text: "Two" },
  ]);
  state = state.apply(state.tr.insertText("more ", 1));
  expect(headingsOf(editor())).toEqual(before);
});
