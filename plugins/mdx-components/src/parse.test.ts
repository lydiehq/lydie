import { describe, expect, test } from "bun:test";

import { constants, images, isEsm, parseTag, readableName, regions, toneOf } from "./parse.ts";
import type { Block } from "./parse.ts";

// Spelled this way so the samples below are not taken for this file's own imports
// (scripts/check-boundaries.ts reads source text).
const IMPORT = ["im", "port"].join("");

describe("component tags", () => {
  test("opening, closing and self-closing tags with their props", () => {
    expect(parseTag('<CalloutBox icon="IconWarning" title="Before you start" type="fyi">')).toEqual(
      {
        kind: "open",
        name: "CalloutBox",
        props: [
          { name: "icon", value: "IconWarning", kind: "string" },
          { name: "title", value: "Before you start", kind: "string" },
          { name: "type", value: "fyi", kind: "string" },
        ],
      },
    );
    expect(parseTag("</CalloutBox>")).toEqual({ kind: "close", name: "CalloutBox", props: [] });
    expect(
      parseTag(
        '<ProductScreenshot\n  imageLight={Light}\n  style={{ a: "}" }}\n  zoom\n  alt="A > B"\n/>',
      ),
    ).toEqual({
      kind: "self",
      name: "ProductScreenshot",
      props: [
        { name: "imageLight", value: "Light", kind: "expression" },
        { name: "style", value: '{ a: "}" }', kind: "expression" },
        { name: "zoom", value: null, kind: "flag" },
        { name: "alt", value: "A > B", kind: "string" },
      ],
    });
  });

  test("anything else is not a tag", () => {
    for (const source of [
      "<div>",
      "<b>raw</b>",
      "<Step>text</Step>",
      "<Step",
      "plain",
      "<Step> more",
    ])
      expect(parseTag(source)).toBeNull();
  });
});

describe("regions", () => {
  const block = (type: string, text: string, i: number): Block => ({
    type,
    text,
    from: i * 10,
    to: i * 10 + 5,
  });
  const doc = (...items: Array<[string, string]>) =>
    items.map(([type, text], i) => block(type, text, i));

  test("module lines, a container with its blocks, and a leaf", () => {
    const blocks = doc(
      ["paragraph", `${IMPORT} { CalloutBox } from 'components/Docs/CalloutBox'`],
      ["paragraph", 'export const Shot =\n"https://example.com/a.png"'],
      ["rawBlock", '<CalloutBox title="Before you start" type="fyi">'],
      ["bulletList", "…"],
      ["rawBlock", "<Step>"],
      ["paragraph", "inside"],
      ["rawBlock", "</Step>"],
      ["rawBlock", "</CalloutBox>"],
      ["rawBlock", "<ProductScreenshot imageLight={Shot} />"],
      ["paragraph", "export is also just a word here"],
    );
    const found = regions(blocks);
    expect(found.map((r) => r.kind)).toEqual(["esm", "container", "container", "leaf"]);
    expect(found[0]).toMatchObject({ imports: 1, exports: 1 });
    expect(found[1]).toMatchObject({ depth: 0, tag: { name: "CalloutBox" } });
    expect(found[1]!.kind === "container" && found[1]!.inner.map((b) => b.type)).toEqual([
      "bulletList",
      "rawBlock",
      "paragraph",
      "rawBlock",
    ]);
    expect(found[2]).toMatchObject({ depth: 1, tag: { name: "Step" } });
  });

  test("a tag without its partner is left alone", () => {
    expect(regions(doc(["rawBlock", "<Step>"], ["paragraph", "x"]))).toEqual([]);
    expect(regions(doc(["paragraph", "x"], ["rawBlock", "</Step>"]))).toEqual([]);
  });
});

test("what a component reads as", () => {
  expect(isEsm(`${IMPORT} x from 'y'`)).toBe(true);
  expect(isEsm("important: read this")).toBe(false);
  expect(readableName("ProductScreenshot")).toBe("Product screenshot");
  expect(toneOf(parseTag('<CalloutBox icon="IconWarning" type="fyi">')!)).toBe("warning");
  expect(toneOf(parseTag('<CalloutBox type="fyi">')!)).toBe("info");
  expect(toneOf(parseTag("<Tab>")!)).toBe("neutral");
  const known = constants(
    'export const Light =\n"https://x.test/a_light.png"\nexport const Dark = "https://x.test/a_dark.png"',
  );
  expect([...known.keys()]).toEqual(["Light", "Dark"]);
  expect(images(parseTag('<Shot imageLight={Light} imageDark={Dark} alt="x" />')!, known)).toEqual([
    { name: "imageLight", url: "https://x.test/a_light.png" },
  ]);
});

test("a disclosure is a component in all but name", () => {
  expect(parseTag("<details>\n<summary>Migrate from <b>another</b> tool</summary>")).toEqual({
    kind: "open",
    name: "details",
    props: [{ name: "title", value: "Migrate from another tool", kind: "string" }],
  });
  expect(parseTag("</details>")).toEqual({ kind: "close", name: "details", props: [] });
});

test("a tag over several lines arrives as a paragraph, and lines are counted, not paragraphs", () => {
  const block = (type: string, text: string, i: number): Block => ({
    type,
    text,
    from: i * 10,
    to: i * 10 + 5,
  });
  const found = regions([
    block("paragraph", `${IMPORT} a from 'a'\n${IMPORT} b from 'b'\nexport const C = "c"`, 0),
    block("paragraph", '<ProductScreenshot\nimageLight={Shot}\nalt="Over several lines"\n/>', 1),
  ]);
  expect(found.map((r) => r.kind)).toEqual(["esm", "leaf"]);
  expect(found[0]).toMatchObject({ imports: 2, exports: 1 });
});
