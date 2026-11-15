import { afterEach, describe, expect, it } from "bun:test";

import { Editor, Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import { defaultSlashItems } from "../slash-items";
import { grammarsReady } from "./core-overrides";
import { createLydieExtensions } from "./index";
import { filterSlashItems } from "./slash-commands";
import { parseWikiLink } from "./wiki-link";

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function createEditor(content: JSONContent = { type: "doc", content: [{ type: "paragraph" }] }) {
  editor = new Editor({ extensions: createLydieExtensions(), content });
  editor.commands.focus("end");
  return editor;
}

// Types like a user: each character goes through the input-rule plugin first.
function type(target: Editor, text: string) {
  for (const char of text) {
    const { view } = target;
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (f) =>
      f(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}

// getJSON() is typed loosely in TipTap 3; the tests read it as plain JSON.
const firstNode = (target: Editor) => (target.getJSON() as JSONContent).content?.[0];

describe("input rules", () => {
  it.each([
    ["# ", "heading"],
    ["- ", "bulletList"],
    ["1. ", "orderedList"],
    ["[ ] ", "taskList"],
    ["> ", "blockquote"],
    ["``` ", "codeBlock"],
    ["$$ ", "mathBlock"],
    ["[!warning] ", "callout"],
    [":::aside ", "directive"],
    ["[^1]: ", "footnoteDefinition"],
  ])("%s makes a %s", (input, nodeType) => {
    const target = createEditor();
    type(target, input);
    expect(firstNode(target)?.type).toBe(nodeType);
  });

  it("turns a blockquote typed as `> [!tip]- ` into a folded callout", () => {
    const target = createEditor();
    type(target, "> [!tip]- ");
    expect(firstNode(target)).toMatchObject({
      type: "callout",
      attrs: { kind: "tip", fold: "closed", title: null },
    });
  });

  it("makes marks from Markdown syntax", () => {
    const target = createEditor();
    type(target, "**b** *i* ~~s~~ `c` ==h== ");
    const marks = (firstNode(target)?.content ?? [])
      .flatMap((n) => n.marks ?? [])
      .map((m) => m.type);
    expect(marks).toEqual(
      expect.arrayContaining(["bold", "italic", "strike", "code", "highlight"]),
    );
  });

  it("makes inline nodes from wiki links, footnotes and math", () => {
    const target = createEditor();
    type(target, "see [[Note#Heading|alias]] and [^2] and $x^2$ but not $5 and $");
    const inline: JSONContent[] = firstNode(target)?.content ?? [];
    expect(inline.find((n) => n.type === "wikiLink")?.attrs).toEqual({
      target: "Note",
      heading: "Heading",
      blockId: null,
      alias: "alias",
    });
    expect(inline.find((n) => n.type === "footnoteReference")?.attrs).toEqual({ label: "2" });
    const math = inline.filter((n) => n.type === "mathInline");
    expect(math).toHaveLength(1);
    expect(math[0]?.content?.[0]?.text).toBe("x^2");
    const plain = inline
      .filter((n) => n.type === "text")
      .map((n) => n.text)
      .join("|");
    expect(plain).toBe("see | and | and | but not $5 and $");
  });

  it("replaces a paragraph that is only `![[target]]` with an embed", () => {
    const target = createEditor();
    type(target, "![[Outline#Structure]]");
    expect(firstNode(target)).toEqual({
      type: "embed",
      attrs: { target: "Outline", heading: "Structure", blockId: null, alias: null },
    });
    expect(JSON.stringify(target.getJSON())).not.toContain("wikiLink");
  });

  it("makes a horizontal rule from ---", () => {
    const target = createEditor();
    type(target, "---");
    expect(firstNode(target)?.type).toBe("horizontalRule");
  });
});

describe("commands", () => {
  it("wraps and unwraps a callout", () => {
    const target = createEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    });
    target.commands.setCallout({ kind: "danger" });
    expect(firstNode(target)).toMatchObject({ type: "callout", attrs: { kind: "danger" } });
    target.commands.unsetCallout();
    expect(firstNode(target)?.type).toBe("paragraph");
  });

  it("inserts the v2 inline and block nodes", () => {
    const target = createEditor();
    target.commands.insertWikiLink({ target: "Note" });
    target.commands.insertFootnoteReference("a");
    target.commands.insertMathInline("y");
    const types = (firstNode(target)?.content ?? []).map((n) => n.type);
    expect(types).toEqual(["wikiLink", "footnoteReference", "mathInline"]);
    target.commands.insertEmbed({ target: "Other" });
    expect((target.getJSON() as JSONContent).content?.some((n) => n.type === "embed")).toBe(true);
  });

  it("indents and outdents list items with Tab (v1 indent handler)", () => {
    const target = createEditor();
    type(target, "- one");
    target.commands.enter();
    target.commands.keyboardShortcut("Tab");
    const list = firstNode(target);
    expect(list?.content?.[0]?.content?.[1]?.type).toBe("bulletList");
    target.commands.keyboardShortcut("Shift-Tab");
    expect(firstNode(target)?.content).toHaveLength(2);
  });

  it("passes Shift-Tab on to the host when there is nothing to outdent", () => {
    let passed = 0;
    const host = Extension.create({
      name: "host",
      priority: 50,
      addKeyboardShortcuts: () => ({ "Shift-Tab": () => ++passed > 0 }),
    });
    editor = new Editor({
      extensions: createLydieExtensions({ extensions: [host] }),
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    editor.commands.focus("end");
    type(editor, "\tx");
    editor.commands.setTextSelection(2);
    editor.commands.keyboardShortcut("Shift-Tab");
    expect(firstNode(editor)?.content?.[0]?.text).toBe("x");
    expect(passed).toBe(0);
    editor.commands.keyboardShortcut("Shift-Tab");
    expect(passed).toBe(1);
  });

  it("calls the host's link editor on Mod-k with a selection", () => {
    let opened = 0;
    editor = new Editor({
      extensions: createLydieExtensions({ onOpenLink: () => opened++ }),
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "word" }] }],
      },
    });
    editor.commands.setTextSelection({ from: 1, to: 5 });
    editor.commands.keyboardShortcut("Mod-k");
    expect(opened).toBe(1);
  });

  describe("caret moves from a selected inline node", () => {
    // "a", a wiki link at 2, "b": the link spans 2..3.
    function selectLink() {
      const target = createEditor({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "a" },
              { type: "wikiLink", attrs: { target: "Note" } },
              { type: "text", text: "b" },
            ],
          },
        ],
      });
      target.view.dispatch(target.state.tr.setSelection(NodeSelection.create(target.state.doc, 2)));
      return target;
    }
    function press(target: Editor, key: string, init: KeyboardEventInit = {}) {
      const event = new KeyboardEvent("keydown", { key, ...init });
      return target.view.someProp("handleKeyDown", (f) => f(target.view, event)) ?? false;
    }

    it.each([
      ["End", {}, 3],
      ["PageDown", {}, 3],
      ["ArrowDown", {}, 3],
      ["ArrowRight", { metaKey: true }, 3],
      ["Home", {}, 2],
      ["ArrowLeft", { altKey: true }, 2],
      // With Shift the caret goes to the far side, so extending keeps the node selected.
      ["End", { shiftKey: true }, 2],
      ["Home", { shiftKey: true }, 3],
    ] as const)("%s %o collapses to %d and leaves the move to the browser", (key, init, pos) => {
      const target = selectLink();
      expect(press(target, key, init)).toBe(false);
      const sel = target.state.selection;
      expect(sel instanceof TextSelection && sel.empty && sel.from === pos).toBeTrue();
    });

    it("leaves plain Left and Right to ProseMirror", () => {
      const target = selectLink();
      press(target, "ArrowRight");
      expect(target.state.selection instanceof NodeSelection).toBeTrue();
    });
  });

  it("round-trips every node through getJSON", () => {
    const content: JSONContent = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
        { type: "rawBlock", attrs: { source: "<x>" } },
        { type: "image", attrs: { src: "a.png", alt: "A", title: null } },
      ],
    };
    // TrailingNode keeps an empty paragraph after a final non-paragraph block.
    expect((createEditor(content).getJSON() as JSONContent).content?.slice(0, 3)).toEqual(
      content.content,
    );
  });
});

describe("helpers", () => {
  it("parses wiki link text", () => {
    expect(parseWikiLink("Note#^abc")).toEqual({
      target: "Note",
      heading: null,
      blockId: "abc",
      alias: null,
    });
    expect(parseWikiLink("#Heading")).toEqual({
      target: "",
      heading: "Heading",
      blockId: null,
      alias: null,
    });
  });

  it("filters slash items by title, id and keywords, prefix matches first", () => {
    const ids = filterSlashItems(defaultSlashItems, "todo").map((item) => item.id);
    expect(ids).toEqual(["taskList"]);
    expect(filterSlashItems(defaultSlashItems, "head").map((i) => i.id)).toEqual([
      "heading1",
      "heading2",
      "heading3",
    ]);
  });
});

describe("code highlighting", () => {
  it("highlights once the grammars load, and keeps it while other blocks change", async () => {
    await grammarsReady;
    const doc = createEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
        {
          type: "codeBlock",
          attrs: { language: "javascript" },
          content: [{ type: "text", text: "const a = 1;" }],
        },
      ],
    });
    const highlighted = () => doc.view.dom.querySelectorAll("[class*=hljs-]").length;
    expect(highlighted()).toBeGreaterThan(0);
    doc.commands.setTextSelection(2);
    const before = doc.view.dom.querySelector("pre")?.innerHTML;
    doc.commands.insertContentAt(1, "x");
    expect(doc.view.dom.querySelector("pre")?.innerHTML).toBe(before);
    expect(highlighted()).toBeGreaterThan(0);
    // An edit inside the block re-highlights it.
    let end = 0;
    doc.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") end = pos + node.nodeSize - 1;
    });
    doc.view.dispatch(doc.state.tr.insertText(" let b = 2;", end));
    expect(doc.view.dom.querySelector("pre")?.textContent).toContain("let b = 2;");
    expect(
      [...doc.view.dom.querySelectorAll("[class*=hljs-]")].some((n) => n.textContent === "2"),
    ).toBe(true);
  });
});

describe("task items", () => {
  const tasks = (checked: boolean): JSONContent => ({
    type: "doc",
    content: [
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Book the skip" }] }],
          },
        ],
      },
    ],
  });

  it("draws the app's checkbox mark beside the input", () => {
    const doc = createEditor(tasks(false));
    const input = doc.view.dom.querySelector('li > label > input[type="checkbox"]');
    const mark = input?.nextElementSibling;
    expect(mark?.hasAttribute("data-checkbox-mark")).toBe(true);
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.querySelector("svg.checkbox-checkmark polyline")).not.toBeNull();
  });

  it("still toggles through the input", () => {
    const doc = createEditor(tasks(false));
    const input = doc.view.dom.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error("no checkbox");
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(firstNode(doc)?.content?.[0]?.attrs?.checked).toBe(true);
  });
});

// The schema contract with @lydie/markdown (LYD-156): what the Markdown side produces must survive
// a trip through the editor.
describe("markdown contract", () => {
  const paragraph = (content: JSONContent[]): JSONContent => ({ type: "paragraph", content });

  it("keeps an embed's heading, block id and size", () => {
    const embed = {
      type: "embed",
      attrs: { target: "Note", heading: "Part", blockId: null, alias: "300" },
    };
    const doc = createEditor({ type: "doc", content: [embed] });
    expect(firstNode(doc)).toEqual(embed);
    expect(doc.getText().trim()).toBe("![[Note#Part|300]]");
  });

  it("splits a typed or inserted embed like the Markdown parser", () => {
    const typed = createEditor();
    type(typed, "![[Note#^b1|Alias]]");
    expect(firstNode(typed)?.attrs).toEqual({
      target: "Note",
      heading: null,
      blockId: "b1",
      alias: "Alias",
    });
    typed.destroy();
    const inserted = createEditor();
    inserted.commands.insertEmbed({ target: "Pic.png|300" });
    expect(firstNode(inserted)?.attrs).toMatchObject({ target: "Pic.png", alias: "300" });
  });

  it("gives back the text of an embed stored whole in target", () => {
    const doc = createEditor({
      type: "doc",
      content: [{ type: "embed", attrs: { target: "Old#Part|200" } }],
    });
    expect(doc.getText().trim()).toBe("![[Old#Part|200]]");
  });

  it("lets code sit inside a link and with emphasis", () => {
    const marked: JSONContent = {
      type: "text",
      text: "x",
      marks: [{ type: "bold" }, { type: "code" }, { type: "link", attrs: { href: "https://a.b" } }],
    };
    const doc = createEditor({ type: "doc", content: [paragraph([marked])] });
    const marks = (firstNode(doc)?.content?.[0]?.marks ?? []).map((m) => m.type).sort();
    expect(marks).toEqual(["bold", "code", "link"]);
  });

  it("keeps soft line breaks in text", () => {
    const doc = createEditor({
      type: "doc",
      content: [paragraph([{ type: "text", text: "a\nb" }])],
    });
    expect(firstNode(doc)?.content?.[0]?.text).toBe("a\nb");
    // TipTap's injected stylesheet (injectCSS, left on) shows them as line breaks.
    expect(document.querySelector("style[data-tiptap-style]")?.textContent).toContain(
      "white-space: pre-wrap",
    );
  });
});
