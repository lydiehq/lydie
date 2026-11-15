import { afterEach, describe, expect, it, mock } from "bun:test";

import { Editor, isMacOS } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import { createLydieExtensions } from "./index";
import type { LydieExtensionsOptions } from "./index";
import type { SuggestionRender } from "./slash-commands";
import type { WikiLinkSuggestion } from "./wiki-link-suggestion";

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

const text = (value: string): JSONContent => ({ type: "text", text: value });
const p = (value?: string): JSONContent =>
  value ? { type: "paragraph", content: [text(value)] } : { type: "paragraph" };
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

function createEditor(content: JSONContent = doc(p()), options: LydieExtensionsOptions = {}) {
  editor = new Editor({ extensions: createLydieExtensions(options), content });
  editor.commands.focus("end");
  return editor;
}

// Types like a user: each character goes through the input-rule plugins first.
function type(target: Editor, value: string) {
  for (const char of value) {
    const { view } = target;
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (f) =>
      f(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}

const json = (target: Editor) => target.getJSON() as JSONContent;
const blocks = (target: Editor) => json(target).content ?? [];
const types = (target: Editor) => blocks(target).map((n) => n.type);
// The position just inside the text of the first block whose text is `value`.
function posOf(target: Editor, value: string) {
  let found = -1;
  target.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isTextblock && node.textContent === value) found = pos + 1;
  });
  return found;
}
// Presses a key through the editor's keydown handlers. TipTap's `keyboardShortcut` command keeps
// only the document steps (not selection changes) and always reports success.
function press(target: Editor, shortcut: string) {
  const parts = shortcut.split(/-(?!$)/);
  const key = parts.at(-1)!;
  const mod = parts.includes("Mod");
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: mod && isMacOS(),
    ctrlKey: mod && !isMacOS(),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift"),
    bubbles: true,
    cancelable: true,
  });
  const { view } = target;
  return view.someProp("handleKeyDown", (f) => f(view, event)) ?? false;
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("block type shortcuts", () => {
  it.each([
    ["Mod-Alt-4", "taskList"],
    ["Mod-Alt-5", "bulletList"],
    ["Mod-Alt-6", "orderedList"],
    ["Mod-Alt-8", "codeBlock"],
    ["Mod-Alt-1", "heading"],
  ])("%s makes a %s (Notion's digits, not H4–H6)", (shortcut, nodeType) => {
    const target = createEditor(doc(p("line")));
    press(target, shortcut);
    expect(types(target)[0]).toBe(nodeType);
  });

  it("Mod-Alt-0 turns a to-do back into plain text", () => {
    const target = createEditor(doc(p("line")));
    press(target, "Mod-Alt-4");
    expect(types(target)[0]).toBe("taskList");
    press(target, "Mod-Alt-0");
    expect(blocks(target)[0]).toEqual(p("line"));
  });

  it("Mod-Alt-0 lifts a nested list item all the way out", () => {
    const target = createEditor();
    type(target, "- a");
    target.commands.enter();
    press(target, "Tab");
    type(target, "b");
    press(target, "Mod-Alt-0");
    expect(blocks(target)[1]).toEqual(p("b"));
  });

  it.skipIf(isMacOS())("binds Notion's Ctrl+Shift digits off macOS", () => {
    const target = createEditor(doc(p("line")));
    press(target, "Mod-Shift-5");
    expect(types(target)[0]).toBe("bulletList");
    press(target, "Mod-Shift-0");
    expect(types(target)[0]).toBe("paragraph");
    // 7…9 stay TipTap's lists.
    press(target, "Mod-Shift-7");
    expect(types(target)[0]).toBe("orderedList");
  });

  it("Mod-Alt-7 wraps the block in a foldable callout and unwraps it again", () => {
    const target = createEditor(doc(p("toggle me")));
    press(target, "Mod-Alt-7");
    expect(blocks(target)[0]).toMatchObject({
      type: "callout",
      attrs: { kind: "note", fold: "open" },
      content: [p("toggle me")],
    });
    press(target, "Mod-Alt-7");
    expect(blocks(target)[0]).toEqual(p("toggle me"));
  });

  it("Mod-Alt-9 turns the line into a link to a new sub-page", async () => {
    const createSubPage = mock(async (title: string) => ({ target: title, title }));
    const target = createEditor(
      doc(p("Before"), { type: "heading", attrs: { level: 2 }, content: [text("Plans")] }),
      {
        createSubPage,
      },
    );
    press(target, "Mod-Alt-9");
    await tick();
    expect(createSubPage).toHaveBeenCalledWith("Plans");
    expect(blocks(target)[1]).toEqual({
      type: "paragraph",
      content: [
        {
          type: "wikiLink",
          attrs: { target: "Plans", heading: null, blockId: null, alias: null },
        },
      ],
    });
    expect(blocks(target)[0]).toEqual(p("Before"));
  });

  it("Mod-Alt-9 does nothing without a host that creates pages", () => {
    const target = createEditor(doc(p("Plans")));
    expect(press(target, "Mod-Alt-9")).toBe(false);
    expect(blocks(target)[0]).toEqual(p("Plans"));
  });
});

describe("Mod-Enter", () => {
  const task = (checked: boolean, value: string): JSONContent => ({
    type: "taskList",
    content: [{ type: "taskItem", attrs: { checked }, content: [p(value)] }],
  });

  it("toggles the task the caret is in", () => {
    const target = createEditor(doc(task(false, "todo")));
    press(target, "Mod-Enter");
    expect(blocks(target)[0]?.content?.[0]?.attrs?.checked).toBe(true);
    press(target, "Mod-Enter");
    expect(blocks(target)[0]?.content?.[0]?.attrs?.checked).toBe(false);
  });

  it("folds and unfolds a foldable callout", () => {
    const target = createEditor(
      doc({
        type: "callout",
        attrs: { kind: "tip", title: null, fold: "open" },
        content: [p("x")],
      }),
    );
    press(target, "Mod-Enter");
    expect(blocks(target)[0]?.attrs?.fold).toBe("closed");
    press(target, "Mod-Enter");
    expect(blocks(target)[0]?.attrs?.fold).toBe("open");
  });

  it("opens the wiki link next to the caret", () => {
    const onOpenWikiLink = mock(() => {});
    const link = {
      type: "wikiLink",
      attrs: { target: "Note", heading: null, blockId: null, alias: null },
    };
    const target = createEditor(doc({ type: "paragraph", content: [text("see "), link] }), {
      onOpenWikiLink,
    });
    press(target, "Mod-Enter");
    expect(onOpenWikiLink).toHaveBeenCalledWith(link.attrs);
  });

  it("never inserts a hard break", () => {
    const target = createEditor(doc(p("plain")));
    press(target, "Mod-Enter");
    expect(blocks(target)).toEqual([p("plain")]);
    // Shift-Enter still does.
    press(target, "Shift-Enter");
    expect(blocks(target)[0]?.content?.at(-1)?.type).toBe("hardBreak");
  });
});

describe("block editing", () => {
  it("Mod-d duplicates the block below and moves into the copy", () => {
    const target = createEditor(doc(p("one"), p("two")));
    target.commands.setTextSelection(posOf(target, "one") + 2);
    press(target, "Mod-d");
    expect(blocks(target)).toEqual([p("one"), p("one"), p("two")]);
    expect(target.state.selection.from).toBe(posOf(target, "one") + 5 + 2);
  });

  it("Mod-d duplicates a whole list item", () => {
    const target = createEditor(doc(p()));
    type(target, "- a");
    press(target, "Mod-d");
    const items = blocks(target)[0]?.content ?? [];
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ type: "listItem", content: [p("a")] });
  });

  it("Mod-Shift-ArrowUp/Down move the block and keep the caret in it", () => {
    const target = createEditor(doc(p("one"), p("two"), p("three")));
    target.commands.setTextSelection(posOf(target, "two") + 1);
    press(target, "Mod-Shift-ArrowUp");
    expect(blocks(target).map((n) => n.content?.[0]?.text)).toEqual(["two", "one", "three"]);
    expect(target.state.selection.$from.parent.textContent).toBe("two");
    // At the top already: nothing moves, but the key is handled.
    expect(press(target, "Mod-Shift-ArrowUp")).toBe(true);
    press(target, "Mod-Shift-ArrowDown");
    press(target, "Mod-Shift-ArrowDown");
    expect(blocks(target).map((n) => n.content?.[0]?.text)).toEqual(["one", "three", "two"]);
    expect(target.state.selection.$from.parent.textContent).toBe("two");
    expect(target.state.selection.$from.parentOffset).toBe(1);
  });

  it("moves a list item within its list", () => {
    const item = (value: string): JSONContent => ({ type: "listItem", content: [p(value)] });
    const target = createEditor(doc({ type: "bulletList", content: [item("a"), item("b")] }));
    target.commands.setTextSelection(posOf(target, "b"));
    press(target, "Mod-Shift-ArrowUp");
    expect(blocks(target)[0]?.content).toEqual([item("b"), item("a")]);
  });

  it("Mod-Alt-t closes every foldable callout when one is open, else opens them all", () => {
    const callout = (fold: string | null): JSONContent => ({
      type: "callout",
      attrs: { kind: "note", title: null, fold },
      content: [p("x")],
    });
    const target = createEditor(doc(callout("open"), callout("closed"), callout(null), p()));
    press(target, "Mod-Alt-t");
    expect(blocks(target).map((n) => n.attrs?.fold)).toEqual(["closed", "closed", null, undefined]);
    press(target, "Mod-Alt-t");
    expect(blocks(target).map((n) => n.attrs?.fold)).toEqual(["open", "open", null, undefined]);
  });

  it("Mod-a selects the block's text first, then the document", () => {
    const target = createEditor(doc(p("one"), p("two")));
    target.commands.setTextSelection(posOf(target, "two") + 1);
    press(target, "Mod-a");
    const { from, to } = target.state.selection;
    expect(target.state.doc.textBetween(from, to)).toBe("two");
    press(target, "Mod-a");
    expect(target.state.selection.from).toBe(0);
    expect(target.state.selection.to).toBe(target.state.doc.content.size);
  });

  it("Mod-a selects a code block's code first", () => {
    const target = createEditor(
      doc({ type: "codeBlock", attrs: { language: null }, content: [text("a\nb")] }, p("x")),
    );
    target.commands.setTextSelection(2);
    press(target, "Mod-a");
    const { from, to } = target.state.selection;
    expect(target.state.doc.textBetween(from, to)).toBe("a\nb");
  });
});

describe("Escape", () => {
  it("selects the top-level block the caret is in", () => {
    const target = createEditor(
      doc(p("one"), { type: "bulletList", content: [{ type: "listItem", content: [p("item")] }] }),
    );
    target.commands.setTextSelection(posOf(target, "item") + 2);
    press(target, "Escape");
    const { selection } = target.state;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.type.name).toBe("bulletList");
    // Already selected: the key goes on to the host.
    expect(press(target, "Escape")).toBe(false);
  });

  it("typing over the selected block adds to its end instead of replacing it", () => {
    const target = createEditor(doc(p("keep"), p()));
    target.commands.setTextSelection(posOf(target, "keep") + 1);
    press(target, "Escape");
    type(target, "s");
    expect(blocks(target)[0]).toEqual(p("keeps"));
  });

  it("closes an open suggestion menu without selecting the block", () => {
    const target = createEditor(doc(p("x")), {
      slashItems: [{ id: "a", title: "A", run: () => {} }],
    });
    type(target, " /");
    press(target, "Escape");
    expect(target.state.selection).not.toBeInstanceOf(NodeSelection);
  });
});

describe("typing shortcuts", () => {
  it.each([
    ['" ', "blockquote"],
    ["“ ", "blockquote"],
    ["> ", "blockquote"],
    ["[] ", "taskList"],
    ["[ ] ", "taskList"],
    ["* ", "bulletList"],
    ["- ", "bulletList"],
    ["+ ", "bulletList"],
    ["1. ", "orderedList"],
    ["# ", "heading"],
    ["## ", "heading"],
    ["### ", "heading"],
    ["---", "horizontalRule"],
  ])("%s makes a %s", (input, nodeType) => {
    const target = createEditor();
    type(target, input);
    expect(types(target)[0]).toBe(nodeType);
  });

  it("### makes a level-3 heading", () => {
    const target = createEditor();
    type(target, "### x");
    expect(blocks(target)[0]).toMatchObject({ type: "heading", attrs: { level: 3 } });
  });

  it.each([
    ["~gone~ ", "strike", "gone"],
    ["~~gone~~ ", "strike", "gone"],
    ["**bold** ", "bold", "bold"],
    ["*it* ", "italic", "it"],
    ["`code` ", "code", "code"],
  ])("%s makes %s", (input, mark, inner) => {
    const target = createEditor();
    type(target, input);
    const marked = blocks(target)[0]?.content?.find((n) => n.marks?.some((m) => m.type === mark));
    expect(marked?.text).toBe(inner);
  });

  it("leaves tildes alone where they are not strike", () => {
    const target = createEditor();
    type(target, "about ~5 and ~ 6 a~b~ ");
    expect(blocks(target)[0]).toEqual(p("about ~5 and ~ 6 a~b~ "));
  });
});

describe("the + menu", () => {
  function recordingRender() {
    const seen: { items: WikiLinkSuggestion[]; command: (item: WikiLinkSuggestion) => void }[] = [];
    let open = false;
    const render: SuggestionRender<WikiLinkSuggestion> = () => ({
      onStart: (props) => {
        open = true;
        seen.push({ items: props.items, command: props.command });
      },
      onUpdate: (props) => {
        seen.push({ items: props.items, command: props.command });
      },
      onExit: () => {
        open = false;
      },
    });
    return { render, seen, isOpen: () => open };
  }

  function setup() {
    const menu = recordingRender();
    const createSubPage = mock(async (title: string) => ({ target: title, title }));
    const target = createEditor(doc(p()), {
      createSubPage,
      pageRender: menu.render,
      searchDocuments: async () => [{ target: "Meeting notes", title: "Meeting notes" }],
    });
    return { target, menu, createSubPage };
  }

  it("offers a new sub-page first, then matching documents", async () => {
    const { target, menu, createSubPage } = setup();
    type(target, "see +Meet");
    await tick();
    expect(menu.isOpen()).toBe(true);
    const last = menu.seen.at(-1)!;
    expect(last.items.map((i) => [i.target, Boolean(i.create)])).toEqual([
      ["Meet", true],
      ["Meeting notes", false],
    ]);
    last.command(last.items[0]!);
    await tick();
    expect(createSubPage).toHaveBeenCalledWith("Meet");
    expect(blocks(target)[0]?.content).toEqual([
      text("see "),
      { type: "wikiLink", attrs: { target: "Meet", heading: null, blockId: null, alias: null } },
      text(" "),
    ]);
  });

  it("links an existing document", async () => {
    const { target, menu, createSubPage } = setup();
    type(target, "+Meet");
    await tick();
    const last = menu.seen.at(-1)!;
    last.command(last.items[1]!);
    expect(createSubPage).not.toHaveBeenCalled();
    expect(blocks(target)[0]?.content?.[0]?.attrs?.target).toBe("Meeting notes");
  });

  it.each(["a+b", "C++", "+1", "x + 2"])("stays closed for %s", async (input) => {
    const { target, menu } = setup();
    type(target, input);
    await tick();
    expect(menu.isOpen()).toBe(false);
    expect(blocks(target)[0]).toEqual(p(input));
  });

  it("stays closed in inline code", async () => {
    const { target, menu } = setup();
    target.commands.setContent(
      doc({ type: "paragraph", content: [{ ...text("x"), marks: [{ type: "code" }] }] }),
    );
    target.commands.focus("end");
    type(target, " +y");
    await tick();
    expect(blocks(target)[0]?.content?.[0]).toMatchObject({
      text: "x +y",
      marks: [{ type: "code" }],
    });
    expect(menu.isOpen()).toBe(false);
  });

  it("stays closed in code blocks", async () => {
    const { target, menu } = setup();
    target.commands.setCodeBlock();
    type(target, "x +y");
    await tick();
    expect(menu.isOpen()).toBe(false);
  });

  it("is off without createSubPage", async () => {
    const menu = recordingRender();
    const target = createEditor(doc(p()), { pageRender: menu.render });
    type(target, "+Meet");
    await tick();
    expect(menu.seen).toHaveLength(0);
  });
});
