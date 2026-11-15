import { describe, expect, test } from "bun:test";

import { parse } from "./parse";

function first(source: string) {
  return parse(source).doc.firstChild!.toJSON() as Record<string, unknown>;
}

describe("parse", () => {
  test("frontmatter is split off as properties", () => {
    const r = parse("---\ntitle: Hi\ntags: [a]\n---\n# Body\n");
    expect(r.properties).toEqual({ title: "Hi", tags: ["a"] });
    expect(r.doc.firstChild!.type.name).toBe("heading");
    expect(r.body.from).toBe(28);
  });

  test("invalid frontmatter keeps properties null and the bytes", () => {
    const r = parse("---\ntitle: [x\n---\nBody\n");
    expect(r.properties).toBeNull();
    expect(r.frontmatter?.error).toBeTruthy();
  });

  test("wikilinks with heading, block and alias", () => {
    const p = parse("[[Note#Head|Alias]] [[Note#^abc]] [[#Local]]").doc.firstChild!;
    const links = p.content.content.filter((n) => n.type.name === "wikiLink").map((n) => n.attrs);
    expect(links).toEqual([
      { target: "Note", heading: "Head", blockId: null, alias: "Alias" },
      { target: "Note", heading: null, blockId: "abc", alias: null },
      { target: "", heading: "Local", blockId: null, alias: null },
    ]);
  });

  test("embed-only paragraphs become embed blocks", () => {
    const doc = parse("![[a.png|100]]\n![[b#H]]\n").doc;
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).attrs).toEqual({
      target: "a.png",
      heading: null,
      blockId: null,
      alias: "100",
    });
    expect(doc.child(1).attrs.heading).toBe("H");
  });

  test("callouts with fold and title", () => {
    expect(first("> [!warning]- Be **careful**\n> body\n")).toEqual({
      type: "callout",
      attrs: { kind: "warning", title: "Be **careful**", fold: "-" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }],
    });
  });

  test("highlight, comments and math", () => {
    const p = parse("==hi== %%c%% $x$ and $5 or $6").doc.firstChild!.toJSON();
    expect(p.content).toEqual([
      { type: "text", marks: [{ type: "highlight" }], text: "hi" },
      { type: "text", text: " " },
      { type: "rawInline", attrs: { source: "%%c%%" } },
      { type: "text", text: " " },
      { type: "mathInline", content: [{ type: "text", text: "x" }] },
      { type: "text", text: " and $5 or $6" },
    ]);
  });

  test("block comments and math blocks", () => {
    const doc = parse("%%\na\n\nb\n%%\n\n$$\nx\n$$\n").doc;
    expect(doc.child(0).toJSON()).toEqual({
      type: "rawBlock",
      attrs: { source: "%%\na\n\nb\n%%" },
    });
    expect(doc.child(1).toJSON()).toEqual({
      type: "mathBlock",
      content: [{ type: "text", text: "x" }],
    });
  });

  test("task lists, and mixed lists keep checkboxes verbatim", () => {
    expect(parse("- [ ] a\n- [x] b\n").doc.firstChild!.type.name).toBe("taskList");
    const mixed = parse("- [ ] a\n- b\n").doc.firstChild!;
    expect(mixed.type.name).toBe("bulletList");
    expect(mixed.firstChild!.firstChild!.firstChild!.toJSON()).toEqual({
      type: "rawInline",
      attrs: { source: "[ ] " },
    });
  });

  test("container directives only; `Note:this` stays text", () => {
    const doc = parse(":::note{a=1}\nhi\n:::\n\nNote:this\n").doc;
    expect(doc.child(0).attrs).toEqual({ name: "note", attrs: { a: "1" } });
    expect(doc.child(1).textContent).toBe("Note:this");
  });

  test("`::::columns` of `:::column` directives is a column layout", () => {
    const doc = parse(
      '::::columns\n:::column{width="40%"}\nleft\n:::\n\n:::column\n- right\n:::\n::::\n',
    ).doc;
    const list = doc.child(0);
    expect(list.type.name).toBe("columnList");
    expect(list.childCount).toBe(2);
    expect(list.child(0).attrs).toEqual({ width: 40 });
    expect(list.child(0).textContent).toBe("left");
    expect(list.child(1).attrs).toEqual({ width: null });
    expect(list.child(1).child(0).type.name).toBe("bulletList");
  });

  test("any other `::::columns` stays a directive", () => {
    for (const source of [
      "::::columns{gap=2}\n:::column\nx\n:::\n::::\n",
      "::::columns\n:::column{width=wide}\nx\n:::\n::::\n",
      "::::columns\n:::column{id=a}\nx\n:::\n::::\n",
      "::::columns\n:::column[label]\nx\n:::\n::::\n",
      "::::columns\n:::column\nx\n:::\n\nloose\n::::\n",
      "::::columns\n::::\n",
    ]) {
      expect(parse(source).doc.child(0).type.name).not.toBe("columnList");
    }
  });

  test("HTML and definitions fall back to raw blocks", () => {
    const r = parse("<div>\nx\n</div>\n\n[a]: /b\n");
    expect(r.doc.child(0).toJSON()).toEqual({
      type: "rawBlock",
      attrs: { source: "<div>\nx\n</div>" },
    });
    expect(r.fallbacks.map((f) => f.kind)).toEqual(["html", "definition"]);
  });

  test("CRLF becomes \\n in the document and is detected", () => {
    const r = parse("a\r\nb\r\n");
    expect(r.doc.firstChild!.textContent).toBe("a\nb");
    expect(r.eol).toBe("\r\n");
  });

  test("tables keep alignment and escaped pipes", () => {
    const t = parse("| a | b |\n|:-|-:|\n| x \\| y | [[N\\|al]] |\n").doc.firstChild!;
    expect(t.child(0).child(0).attrs.align).toBe("left");
    expect(t.child(1).child(0).textContent).toBe("x | y");
    expect(t.child(1).child(1).firstChild!.firstChild!.attrs.alias).toBe("al");
  });
});
