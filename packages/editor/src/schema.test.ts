import { describe, expect, it } from "bun:test";

import { getLydieSchema, LYDIE_MARK_NAMES, LYDIE_NODE_NAMES } from "./schema";
import { describeSchema } from "./schema-description";

// This is the contract with @lydie/markdown. A change here must be matched there.
describe("Lydie schema", () => {
  // The test preload installs a DOM, so this runs the import in a plain Bun process.
  it("builds without a DOM", () => {
    const script = `
      const { getLydieSchema } = await import(${JSON.stringify(`${import.meta.dir}/schema.ts`)});
      console.log(typeof document, getLydieSchema().topNodeType.name);
    `;
    const result = Bun.spawnSync(["bun", "-e", script], { cwd: "/" });
    expect(result.stderr.toString()).toBe("");
    expect(result.stdout.toString().trim()).toBe("undefined doc");
  });

  it("has exactly the contract's nodes and marks", () => {
    const schema = getLydieSchema();
    expect(Object.keys(schema.nodes).sort()).toEqual([...LYDIE_NODE_NAMES].sort());
    expect(Object.keys(schema.marks).sort()).toEqual([...LYDIE_MARK_NAMES].sort());
  });

  it("matches the snapshot of every node, mark and attribute", () => {
    expect(describeSchema(getLydieSchema())).toMatchSnapshot();
  });

  it("accepts a document using every node", () => {
    const schema = getLydieSchema();
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { kind: "tip", title: "T", fold: "closed" },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "x", marks: [{ type: "highlight" }] },
                { type: "wikiLink", attrs: { target: "Note", heading: "H" } },
                { type: "footnoteReference", attrs: { label: "1" } },
                { type: "mathInline", content: [{ type: "text", text: "a^2" }] },
                { type: "rawInline", attrs: { source: "<br>" } },
              ],
            },
          ],
        },
        { type: "embed", attrs: { target: "Note" } },
        { type: "mathBlock", content: [{ type: "text", text: "x" }] },
        { type: "rawBlock", attrs: { source: "<div></div>" } },
        {
          type: "directive",
          attrs: { name: "aside", attrs: { a: "b" } },
          content: [{ type: "paragraph" }],
        },
        {
          type: "columnList",
          content: [
            { type: "column", attrs: { width: 40 }, content: [{ type: "paragraph" }] },
            { type: "column", content: [{ type: "paragraph" }] },
          ],
        },
        {
          type: "footnoteDefinition",
          attrs: { label: "1" },
          content: [{ type: "paragraph" }],
        },
      ],
    });
    expect(() => doc.check()).not.toThrow();
  });
});
