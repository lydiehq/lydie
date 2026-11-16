import { describe, expect, test } from "bun:test";

import { assignBlockId, extract, rewriteLinks } from "./extract";

const note = `---
tags: [project, "area/work"]
related: "[[Other]]"
---
# Plan #draft

See [[Target#Section|the target]] and ![[pic.png|200]]. Also [md](Target%20Note.md#^b1).

- item one ^item-1
- item two

^list-id

Last paragraph #todo ^p1

%% hidden comment with #nottag %%
`;

describe("extract", () => {
  const x = extract(note);

  test("links and embeds with positions", () => {
    expect(
      x.links.map(({ kind, target, heading, blockId, alias, block }) => ({
        kind,
        target,
        heading,
        blockId,
        alias,
        block,
      })),
    ).toEqual([
      { kind: "wikilink", target: "Other", heading: null, blockId: null, alias: null, block: -1 },
      {
        kind: "wikilink",
        target: "Target",
        heading: "Section",
        blockId: null,
        alias: "the target",
        block: 1,
      },
      { kind: "embed", target: "pic.png", heading: null, blockId: null, alias: "200", block: 1 },
      {
        kind: "markdown",
        target: "Target Note.md",
        heading: null,
        blockId: "b1",
        alias: "md",
        block: 1,
      },
    ]);
    for (const l of x.links) expect(note.slice(l.from, l.to)).toMatch(/^!?\[/);
  });

  test("blocks with ids, headings, tags, text", () => {
    expect(x.blocks.map((b) => [b.index, b.type, b.id])).toEqual([
      [0, "heading", null],
      [1, "paragraph", null],
      [2, "bulletList", "list-id"],
      [4, "paragraph", "p1"],
      [5, "rawBlock", null],
    ]);
    expect(x.blockIds.map((b) => [b.id, b.block])).toEqual([
      ["item-1", 2],
      ["list-id", 2],
      ["p1", 4],
    ]);
    expect(x.headings).toMatchObject([{ level: 1, text: "Plan #draft", block: 0 }]);
    expect(x.tags).toEqual(["project", "area/work", "draft", "todo"]);
    expect(x.text).toContain("See the target and");
    expect(x.text).not.toContain("hidden comment");
    expect(x.blocks[3]!.text).toBe("Last paragraph #todo");
  });

  test("rewriteLinks touches only target bytes", () => {
    const out = rewriteLinks(note, (l) =>
      l.target.startsWith("Target") ? l.target.replace("Target", "Renamed") : undefined,
    );
    expect(out).toBe(
      note
        .replace("[[Target#Section|the target]]", "[[Renamed#Section|the target]]")
        .replace("(Target%20Note.md#^b1)", "(Renamed%20Note.md#^b1)"),
    );
    expect(rewriteLinks(note, (l) => (l.target === "Other" ? "New/Other" : undefined))).toContain(
      'related: "[[New/Other]]"',
    );
  });

  test("assignBlockId adds an id to one block only", () => {
    const p = assignBlockId(note, 1, "abc");
    expect(p.source).toBe(
      note.replace("Also [md](Target%20Note.md#^b1).", "Also [md](Target%20Note.md#^b1). ^abc"),
    );
    expect(assignBlockId(note, 2).id).toBe("list-id");
    expect(assignBlockId("| a |\n| - |\n| 1 |\n\nnext\n", 0, "t1").source).toBe(
      "| a |\n| - |\n| 1 |\n\n^t1\n\nnext\n",
    );
    expect(assignBlockId("- a\n# H\n", 0, "l1").source).toBe("- a\n\n^l1\n\n# H\n");
    expect(extract(assignBlockId("para\n", 0).source).blocks[0]!.id).toMatch(/^[a-z0-9]{6}$/);
  });
});

test("extract: links name the top-level block they are in", () => {
  const blocks = Array.from({ length: 300 }, (_, i) =>
    i % 3 === 0 ? `- item [[L${i}]]\n- more [md](M${i}.md)` : `Text ${i} [[L${i}]]`,
  );
  const x = extract(`---\nup: "[[Top]]"\n---\n${blocks.join("\n\n")}\n`);
  expect(x.links[0]).toMatchObject({ target: "Top", block: -1 });
  const body = x.links.slice(1);
  expect(body.filter((l) => l.kind === "wikilink").map((l) => l.block)).toEqual(
    blocks.map((_, i) => i),
  );
  expect(body.filter((l) => l.kind === "markdown").map((l) => l.block)).toEqual(
    blocks.map((_, i) => i).filter((i) => i % 3 === 0),
  );
});
