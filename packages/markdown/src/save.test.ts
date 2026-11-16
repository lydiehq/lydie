import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Fragment } from "prosemirror-model";
import type { Node } from "prosemirror-model";

import { checkSave, editBlock, parseView } from "../test/fidelity";
import { serialize } from "./index";
import { parse } from "./parse";
import { save, verifyRegions } from "./save";
import type { Layout } from "./save";
import { schema } from "./schema";

type Json = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Json[];
  text?: string;
  marks?: unknown[];
};

function json(source: string) {
  return parse(source).doc.toJSON() as Json;
}

describe("save", () => {
  test("no edits: byte-identical, including odd whitespace and CRLF", () => {
    const src =
      "---\r\ntitle:   x \r\n---\r\n\r\n\r\n*  item\t\r\n*  two   \r\n\r\n\r\n\r\nText   \r\n";
    expect(save({ original: src, doc: parse(src).doc }).source).toBe(src);
  });

  test("editing one paragraph leaves everything else byte-identical", () => {
    const src = "# T\n\n__bold__ *em*  \nnext\n\n* a\n* b\n\n\n> q\n";
    const doc = json(src);
    doc.content![1]!.content![0]!.text = "BOLD";
    const out = save({ original: src, doc });
    expect(out.verified).toBe(true);
    // The edited block keeps its emphasis and hard-break style.
    expect(out.source).toBe("# T\n\n__BOLD__ *em*  \nnext\n\n* a\n* b\n\n\n> q\n");
  });

  test("toggling one task in a long list rewrites only that marker", () => {
    const items = Array.from({ length: 50 }, (_, i) => `*   [ ] task ${i}`).join("\n");
    const src = `${items}\n`;
    const doc = json(src);
    doc.content![0]!.content![25]!.attrs!.checked = true;
    const out = save({ original: src, doc });
    expect(out.source).toBe(src.replace("*   [ ] task 25", "*   [x] task 25"));
  });

  test("inserting a list item uses the list's marker and spacing", () => {
    const src = "+ a\n+ b\n";
    const doc = json(src);
    const list = doc.content![0]!;
    list.content!.splice(1, 0, {
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }],
    });
    expect(save({ original: src, doc }).source).toBe("+ a\n+ new\n+ b\n");
  });

  test("columns: editing one column leaves the others byte-identical", () => {
    const src =
      '::::columns\n:::column{width="60%"}\nleft  \ntext\n:::\n\n:::column\n* right\n:::\n::::\n';
    const doc = json(src);
    doc.content![0]!.content![1]!.content![0]!.content![0]!.content![0]!.content![0]!.text = "R";
    const out = save({ original: src, doc });
    expect(out.verified).toBe(true);
    expect(out.source).toBe(src.replace("* right", "* R"));
  });

  test("columns: a new layout and a resized column are written as directives", () => {
    const column = (text: string, width: number | null = null): Json => ({
      type: "column",
      attrs: { width },
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const src = "Intro\n";
    const doc = json(src);
    doc.content!.push({ type: "columnList", content: [column("a", 33.3), column("b")] });
    const out = save({ original: src, doc });
    expect(out.verified).toBe(true);
    expect(out.source).toBe(
      'Intro\n\n::::columns\n:::column{width="33.3%"}\na\n:::\n\n:::column\nb\n:::\n::::\n',
    );
  });

  test("columns: a directive inside a column lengthens the outer fences", () => {
    const doc: Json = {
      type: "doc",
      content: [
        {
          type: "columnList",
          content: [
            {
              type: "column",
              content: [
                {
                  type: "directive",
                  attrs: { name: "note", attrs: {} },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const out = serialize(doc);
    expect(out).toBe(":::::columns\n::::column\n:::note\nx\n:::\n::::\n:::::\n");
    expect(json(out)).toEqual(json(serialize(json(out))));
    expect(json(out).content![0]!.type).toBe("columnList");
  });

  test("editing inside a callout keeps the other lines and prefixes", () => {
    const src = "> [!note]- Title\n> one\n>\n>   two  \n";
    const doc = json(src);
    doc.content![0]!.content![0]!.content![0]!.text = "ONE";
    expect(save({ original: src, doc }).source).toBe("> [!note]- Title\n> ONE\n>\n>   two  \n");
  });

  test("changing a callout title rewrites only the header", () => {
    const src = "> [!tip] Old\n> body\n";
    const doc = json(src);
    doc.content![0]!.attrs!.title = "New";
    expect(save({ original: src, doc }).source).toBe("> [!tip] New\n> body\n");
  });

  test("the editor's callout folds (open/closed) are written as + and -", () => {
    const src = "> [!tip] Old\n> body\n";
    const doc = json(src);
    doc.content![0]!.attrs!.fold = "closed";
    expect(save({ original: src, doc }).source).toBe("> [!tip]- Old\n> body\n");
    doc.content![0]!.attrs!.fold = "open";
    expect(save({ original: src, doc }).source).toBe("> [!tip]+ Old\n> body\n");
    const callout = { type: "callout", attrs: { kind: "note", fold: "closed", title: "More" } };
    const paragraph = { type: "paragraph", content: [{ type: "text", text: "x" }] };
    expect(serialize({ type: "doc", content: [{ ...callout, content: [paragraph] }] })).toBe(
      "> [!note]- More\n> x\n",
    );
  });

  test("CRLF files get CRLF in re-serialised blocks", () => {
    const src = "a\r\n\r\nb\r\n";
    const doc = json(src);
    doc.content!.push({ type: "paragraph", content: [{ type: "text", text: "c\nd" }] });
    expect(save({ original: src, doc }).source).toBe("a\r\n\r\nb\r\n\r\nc\r\nd\r\n");
  });

  test("deleting a block removes it and one gap", () => {
    const src = "a\n\nb\n\nc\n";
    const doc = json(src);
    doc.content!.splice(1, 1);
    expect(save({ original: src, doc }).source).toBe("a\n\nc\n");
  });

  test("a new list next to an existing one gets a different marker", () => {
    const src = "- a\n";
    const doc = json(src);
    doc.content!.push({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }],
        },
      ],
    });
    const out = save({ original: src, doc });
    expect(out.verified).toBe(true);
    expect(parse(out.source).doc.childCount).toBe(2);
  });

  test("property edit rewrites only the changed key", () => {
    const src = "---\n# keep me\ntitle:   'x'   # c\ntags: [a,   b]\nn: 1\n---\nBody\n";
    const r = parse(src);
    const out = save({
      original: r,
      doc: r.doc,
      properties: { ...r.properties, n: 2, added: true },
    });
    expect(out.source).toBe(
      "---\n# keep me\ntitle:   'x'   # c\ntags: [a,   b]\nn: 2\nadded: true\n---\nBody\n",
    );
  });

  test("removing a property and creating frontmatter", () => {
    const src = "---\na: 1\nb: 2\n---\nx\n";
    const r = parse(src);
    expect(save({ original: r, doc: r.doc, properties: { b: 2 } }).source).toBe(
      "---\nb: 2\n---\nx\n",
    );
    const plain = parse("x\n");
    expect(save({ original: plain, doc: plain.doc, properties: { id: "01H" } }).source).toBe(
      "---\nid: 01H\n---\nx\n",
    );
  });

  test("editor attributes and empty paragraphs are ignored", () => {
    const src = "a\n\nb\n";
    const doc = json(src);
    doc.content![0]!.attrs = { id: "block-1" };
    doc.content!.push({ type: "paragraph" });
    expect(save({ original: src, doc }).source).toBe(src);
  });

  test("the result's parse reads the saved text and is the next save's original", () => {
    // Long enough to be kept by the parse cache.
    const src = Array.from({ length: 80 }, (_, i) => `Paragraph ${i} with some words.`).join(
      "\n\n",
    );
    const doc = json(src);
    doc.content![3]!.content![0]!.text = "Third, edited";
    const first = save({ original: src, doc });
    expect(first.verified).toBe(true);
    expect(first.parse.source).toBe(first.source);
    // The verification's parse is the one later reads of the same text get.
    expect(parse(first.source)).toBe(first.parse);
    doc.content![40]!.content![0]!.text = "Fortieth, edited";
    const second = save({ original: first.parse, doc });
    expect(second.source).toBe(save({ original: src, doc }).source);
    expect(second.source).toBe(
      src
        .replace("Paragraph 3 with some words.", "Third, edited")
        .replace("Paragraph 40 with some words.", "Fortieth, edited"),
    );
    // Nothing changed: the original's own parse.
    const noop = save({ original: second.parse, doc });
    expect(noop.source).toBe(second.source);
    expect(noop.parse).toBe(second.parse);
  });

  test("serialize: canonical output for a new document", () => {
    const doc = json("Setext\n===\n\n* a\n* b\n\n__x__ _y_\n");
    expect(serialize(doc, { title: "T" })).toBe(
      "---\ntitle: T\n---\n# Setext\n\n- a\n- b\n\n**x** *y*\n",
    );
  });
});

describe("save: verifying only what changed", () => {
  // Random edits of several blocks at once, with content that reads differently next to its
  // neighbours if written carelessly: the save verified block by block must agree with one
  // verified in full, and its parse must be a fresh parse of its output.
  const tricky = [
    "===",
    "---",
    "- item",
    "1. one",
    "    indented",
    "```",
    "<div>",
    "%% open",
    "$$",
    "> quote",
    "| a | b |",
    ":::note",
    "[x]: y",
    "![[embed]]",
    "plain words",
  ];
  const fixtures = join(import.meta.dir, "..", "fixtures", "ofm");
  const sources = [
    ...readdirSync(fixtures).map((f) => readFileSync(join(fixtures, f), "utf8")),
    Array.from({ length: 120 }, (_, i) =>
      i % 6 === 0
        ? `## H ${i}`
        : i % 6 === 1
          ? `- a ${i}\n- b ${i}`
          : i % 6 === 2
            ? "```js\nx()\n```"
            : i % 6 === 3
              ? `> [!note] T\n> body ${i}`
              : i % 6 === 4
                ? `![[a${i}]] ![[b${i}]]`
                : `Text *${i}* [[L${i}]]`,
    ).join("\n\n"),
  ];

  // First attempts that read differently next to an unchanged neighbour: only parsing the
  // neighbour too shows it (then the save tries again with blank lines around the block).
  const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
  const cases: Array<[string, string, (blocks: Node[]) => void]> = [
    // "x" over "---" is a setext heading.
    ["a\n\n***\n---\n", "a\n\nx\n\n---\n", (b) => b.splice(1, 1, paragraph("x"))],
    // "p" right under a quote continues it lazily.
    ["> q\n***\nend\n", "> q\n\np\n\nend\n", (b) => b.splice(1, 1, paragraph("p"))],
    // Embeds on one line are blocks of their own that do not start a line.
    [
      "![[a]] ![[b]]\n\nafter\n",
      null!,
      (b) => b.splice(1, 1, schema.nodes.embed.create({ target: "c" })),
    ],
  ];
  for (const [source, expected, edit] of cases) {
    test(`a changed block is parsed with its neighbours: ${JSON.stringify(source)}`, () => {
      const filler = Array.from({ length: 30 }, (_, i) => `Filler ${i}.`).join("\n\n");
      const original = parse(`${source}\n${filler}\n`);
      const blocks: Node[] = [];
      original.doc.forEach((c) => blocks.push(c));
      edit(blocks);
      const { result, mismatch } = checkSave(
        original,
        schema.nodes.doc.create(null, Fragment.fromArray(blocks)),
      );
      expect(mismatch).toBeNull();
      expect(result.verified).toBe(true);
      if (expected) expect(result.source).toBe(`${expected}\n${filler}\n`);
    });
  }

  test("a block that reads alone as written but swallows its neighbour fails", () => {
    // As a serializer bug would write it: the changed code block's fence is left open, so the
    // paragraph after it is code too. The block alone reads as the edited one.
    const filler = Array.from({ length: 30 }, (_, i) => `Filler ${i}.`).join("\n\n");
    const original = parse(`a\n\n\`\`\`\nb\n\`\`\`\n\nc\n\n${filler}\n`);
    const written = `a\n\n\`\`\`\nB\n\nc\n\n${filler}\n`;
    const blocks: Node[] = [];
    original.doc.forEach((c) => blocks.push(c));
    blocks[1] = schema.nodes.codeBlock.create(null, schema.text("B"));
    const edited = schema.nodes.doc.create(null, Fragment.fromArray(blocks));
    const kids = original.body.children!;
    const layout: Layout = { pieces: [], seams: [] };
    let at = 0;
    for (let i = 0; i < kids.length; i++) {
      const text = i === 1 ? "```\nB" : original.source.slice(kids[i]!.from, kids[i]!.to);
      if (i > 0) at += original.source.slice(kids[i - 1]!.to, kids[i]!.from).length;
      layout.pieces.push({ orig: i, from: at, to: at + text.length, clean: i !== 1 });
      layout.seams.push(i > 0);
      at += text.length;
    }
    expect(written.slice(layout.pieces[2]!.from, layout.pieces[2]!.to)).toBe("c");
    expect(verifyRegions(original, written, 0, layout, edited, null)).toBeNull();
    // The same layout over the correct text passes, with the output's parse.
    const fixed = written.replace("```\nB\n", "```\nB\n```\n");
    const fixedLayout: Layout = {
      seams: layout.seams,
      pieces: layout.pieces.map((p, i) =>
        i < 1 ? p : { ...p, from: p.from + (i === 1 ? 0 : 4), to: p.to + 4 },
      ),
    };
    const good = verifyRegions(original, fixed, 0, fixedLayout, edited, null);
    expect(good && parseView(good)).toEqual(parseView(parse(fixed)));
  });

  test("agrees with verifying in full, over random multi-block edits", () => {
    let seed = 11;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const failures: string[] = [];
    let runs = 0;
    for (const [f, source] of sources.entries()) {
      const original = parse(source);
      for (let round = 0; round < 40; round++) {
        const blocks: Node[] = [];
        original.doc.forEach((c) => blocks.push(c));
        for (let k = 1 + random(3); k > 0 && blocks.length > 0; k--) {
          const at = random(blocks.length);
          const text = tricky[random(tricky.length)]!;
          const op = random(5);
          if (op === 0) blocks.splice(at, 1);
          else if (op === 1) blocks.splice(at, 0, blocks[at]!);
          else if (op === 2) blocks.splice(at, 1, editBlock(blocks[at]!) ?? blocks[at]!);
          else if (op === 3)
            blocks.splice(at, 0, schema.nodes.paragraph.create(null, schema.text(text)));
          else if (at + 1 < blocks.length)
            [blocks[at], blocks[at + 1]] = [blocks[at + 1]!, blocks[at]!];
        }
        if (blocks.length === 0) continue;
        const doc = schema.nodes.doc.create(null, Fragment.fromArray(blocks));
        runs++;
        const { mismatch } = checkSave(original, doc);
        if (mismatch) failures.push(`source ${f} round ${round}: ${mismatch}`);
      }
    }
    expect(failures).toEqual([]);
    expect(runs).toBeGreaterThan(200);
  });
});
