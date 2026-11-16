import { expect, test } from "bun:test";

import { getLydieSchema } from "@lydie/plugin-api/editor";
import type { ProseMirrorNode } from "@lydie/plugin-api/editor";

import { sourceOf, startsLikeMdx } from "./view.ts";

test("a block starts like MDX when its whole source would, read from its start only", () => {
  const schema = getLydieSchema();
  const text = (value: string) => schema.text(value);
  const raw = (source: string) => schema.nodes.rawInline!.create({ source });
  const br = () => schema.nodes.hardBreak!.create();
  const paragraph = (...content: ProseMirrorNode[]) =>
    schema.nodes.paragraph!.create(null, content);
  const blocks = [
    paragraph(text("import Chart, { Tabs }")),
    paragraph(text("  "), text("exp"), text("ort const a = 1")),
    paragraph(br(), text("import a")),
    paragraph(raw('<Card\n  title="x"\n/>')),
    paragraph(text("<card>")),
    paragraph(text("Important")),
    paragraph(text("      "), text("      "), text("<Tip>")),
    paragraph(text("export")),
    paragraph(text("plain text")),
    schema.nodes.rawBlock!.create({ source: "<Note>" }),
    schema.nodes.heading!.create({ level: 1 }, text("<Heading")),
    schema.nodes.horizontalRule!.create(),
  ];
  for (const block of blocks) {
    const whole =
      block.type.name === "rawBlock" ||
      (block.type.name === "paragraph" && /^\s*(import\s|export\s|<[A-Z])/.test(sourceOf(block)));
    expect([block.toString(), startsLikeMdx(block)]).toEqual([block.toString(), whole]);
  }
});
