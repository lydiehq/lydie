import { afterEach, describe, expect, it, spyOn } from "bun:test";

import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import { loadGrammars } from "../extensions/code-highlight";
import { LydieEditor } from "./LydieEditor";

afterEach(() => cleanup());

const content: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
    {
      type: "callout",
      attrs: { kind: "note", title: null, fold: null },
      content: [{ type: "paragraph" }],
    },
    { type: "rawBlock", attrs: { source: "<b>raw</b>" } },
    { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "let a" }] },
  ],
};

describe("<LydieEditor>", () => {
  it("mounts with content and node views", async () => {
    const { container } = render(<LydieEditor content={content} aria-label="Doc" />);
    const root = container.querySelector(".ProseMirror");
    expect(root?.textContent).toContain("Hello");
    expect(root?.getAttribute("aria-label")).toBe("Doc");
    await waitFor(() => {
      expect(container.querySelector('[data-type="callout"] input')).not.toBeNull();
      expect(container.querySelector('[data-type="raw-block"] textarea')).not.toBeNull();
    });
  });

  it("shows an inline raw source over several lines in a textarea, newlines kept", async () => {
    const source = '<Shot\n  src="a.png"\n/>';
    const { container } = render(
      <LydieEditor
        content={{
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "rawInline", attrs: { source } }] },
            { type: "paragraph", content: [{ type: "rawInline", attrs: { source: "<x>" } }] },
          ],
        }}
      />,
    );
    await waitFor(() => {
      const textarea = container.querySelector<HTMLTextAreaElement>(
        '[data-type="raw-inline"] textarea',
      );
      expect(textarea?.value).toBe(source);
      expect(container.querySelector('[data-type="raw-inline"] input')).not.toBeNull();
    });
  });

  it("marks the content when the drag handle shows block labels", () => {
    const plain = render(<LydieEditor content={content} dragHandle={<span />} />);
    expect(plain.container.querySelector(".ProseMirror")?.hasAttribute("data-block-labels")).toBe(
      false,
    );
    cleanup();
    const labelled = render(<LydieEditor content={content} dragHandle={() => <span />} />);
    expect(
      labelled.container.querySelector(".ProseMirror")?.hasAttribute("data-block-labels"),
    ).toBe(true);
  });

  it("the initial content is not an edit: nothing to undo, no update", async () => {
    let editor: Editor | undefined;
    const updates: JSONContent[] = [];
    render(
      <LydieEditor
        content={content}
        onCreate={(e) => (editor = e)}
        onUpdate={(json) => updates.push(json)}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    expect(editor!.state.doc.textContent).toContain("Hello");
    expect(editor!.can().undo()).toBe(false);
    expect(updates).toEqual([]);
    expect(editor!.state.selection.from).toBe(1);
  });

  it("emits JSON on update and exposes the editor", async () => {
    let editor: Editor | undefined;
    const updates: JSONContent[] = [];
    render(
      <LydieEditor
        content={content}
        onCreate={(e) => (editor = e)}
        onUpdate={(json) => updates.push(json)}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    act(() => {
      editor!.commands.insertContentAt(1, "Oh ");
    });
    expect(updates.at(-1)?.content?.[0]?.content?.[0]?.text).toBe("Oh Hello");
  });

  it("callouts: the title and the fold are attributes", async () => {
    let editor: Editor | undefined;
    const folding: JSONContent = {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { kind: "tip", title: null, fold: "open" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Inside" }] }],
        },
      ],
    };
    const { container } = render(<LydieEditor content={folding} onCreate={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());
    const callout = () => (editor!.getJSON() as JSONContent).content?.[0];
    const title = container.querySelector<HTMLInputElement>('input[aria-label="Callout title"]')!;
    expect(title.placeholder).toBe("Tip");
    act(() => {
      title.value = "Remember";
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(callout()?.attrs?.title).toBe("Remember");
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse callout"]',
    )!;
    act(() => toggle.click());
    expect(callout()?.attrs?.fold).toBe("closed");
    expect(container.querySelector('[data-type="callout"]')?.getAttribute("data-folded")).toBe(
      "true",
    );
    expect(toggle.getAttribute("aria-label")).toBe("Expand callout");
    // Outside changes show in the field.
    act(() => {
      editor!.commands.command(({ tr }) => {
        tr.setNodeMarkup(0, undefined, { ...callout()!.attrs, title: "Changed" });
        return true;
      });
    });
    expect(title.value).toBe("Changed");
  });

  it("code blocks: highlighted, with a language picker that sets the language", async () => {
    await loadGrammars();
    let editor: Editor | undefined;
    const { container } = render(<LydieEditor content={content} onCreate={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());
    const select = await waitFor(() => {
      const found = container.querySelector<HTMLSelectElement>(
        'select[aria-label="Code language"]',
      );
      expect(found?.value).toBe("ts");
      return found!;
    });
    expect(container.querySelector("pre code")?.textContent).toBe("let a");
    expect(container.querySelector("pre code [class*=hljs-]")).not.toBeNull();
    act(() => {
      select.value = "python";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const block = () =>
      (editor!.getJSON() as JSONContent).content?.find((n) => n.type === "codeBlock");
    expect(block()?.attrs?.language).toBe("python");
    await waitFor(() => expect(select.value).toBe("python"));
  });

  it("applies new content from props but not its own echoes", async () => {
    let editor: Editor | undefined;
    const next: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Replaced" }] }],
    };
    const { rerender, container } = render(
      <LydieEditor content={content} onCreate={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    rerender(<LydieEditor content={next} onCreate={(e) => (editor = e)} />);
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")?.textContent).toBe("Replaced"),
    );
  });

  it("respects editable", async () => {
    const { container } = render(<LydieEditor content={content} editable={false} />);
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe(
        "false",
      ),
    );
  });

  it("binds to a Yjs document", async () => {
    const ydoc = new Y.Doc();
    let editor: Editor | undefined;
    render(<LydieEditor ydoc={ydoc} onCreate={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());
    act(() => {
      editor!.commands.insertContent("synced");
    });
    expect(ydoc.getXmlFragment("default").toJSON()).toContain("synced");
  });
});

describe("block drag handle", () => {
  // happy-dom has no layout: every element is a 600 × 20 box, so TipTap's hit test finds a block,
  // and the test says which one is under the pointer (`posAtCoords`).
  let boxes: { mockRestore: () => void } | undefined;
  afterEach(() => boxes?.mockRestore());

  const blocks: JSONContent = {
    type: "doc",
    content: ["one", "two", "three"].map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
  // Where a paragraph's text starts.
  const textOf = (editor: Editor, text: string) => {
    let found = -1;
    editor.state.doc.forEach((node, offset) => {
      if (node.textContent === text) found = offset + 1;
    });
    return found;
  };

  // LYD-354: TipTap's handle hides on dragend and, on the drop's doc change, quietly re-targets the
  // block now at the dragged block's old position. It only shows again for a different block, so
  // hovering that one first after a drop left the handle hidden.
  it("shows again after a drop, over the block that took the dragged block's place", async () => {
    boxes = spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, 600, 20),
    );
    let editor: Editor | undefined;
    const { container } = render(
      <LydieEditor content={blocks} onCreate={(e) => (editor = e)} dragHandle={<span />} />,
    );
    await waitFor(() => expect(container.querySelector(".drag-handle")).not.toBeNull());
    const handle = container.querySelector<HTMLElement>(".drag-handle")!;
    const view = editor!.view;
    let pointer = textOf(editor!, "one");
    view.posAtCoords = () => ({ pos: pointer, inside: pointer - 1 });
    const hover = async () => {
      view.dom.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    };

    await hover();
    await waitFor(() => expect(handle.style.visibility).toBe(""));

    // Drag "one" below "two": the drop moves it, then the handle gets dragend.
    act(() => {
      const one = editor!.state.doc.child(0);
      const tr = editor!.state.tr.delete(0, one.nodeSize);
      tr.insert(tr.doc.child(0).nodeSize, one);
      view.dispatch(tr);
      handle.dispatchEvent(new Event("dragend", { bubbles: true }));
    });
    expect(editor!.state.doc.child(0).textContent).toBe("two");
    expect(handle.style.visibility).toBe("hidden");

    pointer = textOf(editor!, "two");
    await hover();
    await waitFor(() => expect(handle.style.visibility).toBe(""));
  });
});
