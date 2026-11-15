import { describe, expect, test } from "bun:test";

import { schema } from "./schema";

// The contract with @lydie/editor. Changing anything here needs the same change there.
describe("schema contract", () => {
  test("node names and attributes", () => {
    const nodes = Object.fromEntries(
      Object.entries(schema.nodes).map(([name, type]) => [
        name,
        Object.keys(type.spec.attrs ?? {}),
      ]),
    );
    expect(nodes).toEqual({
      doc: [],
      paragraph: [],
      text: [],
      heading: ["level"],
      bulletList: [],
      orderedList: ["start"],
      listItem: [],
      taskList: [],
      taskItem: ["checked"],
      blockquote: [],
      codeBlock: ["language"],
      horizontalRule: [],
      hardBreak: [],
      image: ["src", "alt", "title"],
      table: [],
      tableRow: [],
      tableHeader: ["colspan", "rowspan", "colwidth", "align"],
      tableCell: ["colspan", "rowspan", "colwidth", "align"],
      callout: ["kind", "title", "fold"],
      wikiLink: ["target", "heading", "blockId", "alias"],
      embed: ["target", "heading", "blockId", "alias"],
      mathInline: [],
      mathBlock: [],
      footnoteReference: ["label"],
      footnoteDefinition: ["label"],
      directive: ["name", "attrs"],
      columnList: [],
      column: ["width"],
      rawBlock: ["source"],
      rawInline: ["source"],
    });
  });

  test("mark names and attributes", () => {
    const marks = Object.fromEntries(
      Object.entries(schema.marks).map(([name, type]) => [
        name,
        Object.keys(type.spec.attrs ?? {}),
      ]),
    );
    expect(marks).toEqual({
      link: ["href", "title"],
      bold: [],
      italic: [],
      strike: [],
      highlight: [],
      code: [],
    });
  });

  test("image is inline, embed is a block", () => {
    expect(schema.nodes.image.isInline).toBe(true);
    expect(schema.nodes.embed.isBlock).toBe(true);
  });
});
