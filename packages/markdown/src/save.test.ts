import { describe, expect, test } from "bun:test";

import { serialize } from "./index";
import { parse } from "./parse";
import { save } from "./save";

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

  test("serialize: canonical output for a new document", () => {
    const doc = json("Setext\n===\n\n* a\n* b\n\n__x__ _y_\n");
    expect(serialize(doc, { title: "T" })).toBe(
      "---\ntitle: T\n---\n# Setext\n\n- a\n- b\n\n**x** *y*\n",
    );
  });
});
