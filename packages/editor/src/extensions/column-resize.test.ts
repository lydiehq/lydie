import { afterEach, describe, expect, it } from "bun:test";

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import {
  COLUMN_RESIZE_STEP,
  COLUMN_RESIZE_STEP_LARGE,
  columnsStacked,
  setColumnsStacked,
} from "./column-resize";
import { createLydieExtensions } from "./index";

let editor: Editor | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  host?.remove();
  host = undefined;
});

const p = (value: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text: value }],
});
const column = (value: string, width: number | null = null): JSONContent => ({
  type: "column",
  attrs: { width },
  content: [p(value)],
});
const row = (...columns: JSONContent[]): JSONContent => ({ type: "columnList", content: columns });

// Mounted in the document, so focus moves as in a browser.
function createEditor(...columns: JSONContent[]) {
  host = document.createElement("div");
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: createLydieExtensions(),
    content: { type: "doc", content: [p("before"), row(...columns)] },
  });
  return editor;
}

const rowPos = (target: Editor) => target.state.doc.child(0).nodeSize;
const widths = (target: Editor) => {
  const node = target.state.doc.nodeAt(rowPos(target))!;
  return Array.from({ length: node.childCount }, (_, i) => node.child(i).attrs.width);
};
const bar = () => host!.querySelector<HTMLElement>(".lydie-column-resize");

function selectRow(target: Editor) {
  target.view.focus();
  target.view.dispatch(
    target.state.tr.setSelection(NodeSelection.create(target.state.doc, rowPos(target))),
  );
}

// A real keydown on `el`, through the DOM like a key press.
function press(el: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("column resize from the keyboard", () => {
  it("Tab on a selected row focuses its first gap as a separator", () => {
    const target = createEditor(column("a"), column("b"), column("c"));
    selectRow(target);
    expect(press(target.view.dom, "Tab")).toBe(true);
    const handle = bar()!;
    expect(document.activeElement).toBe(handle);
    expect(handle.hidden).toBe(false);
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-label")).toBe("Resize columns 1 and 2");
    expect(handle.getAttribute("aria-valuenow")).toBe("33");
    expect(handle.getAttribute("aria-valuemin")).toBe("10");
    expect(handle.getAttribute("aria-valuemax")).toBe("57");
    // Not in the page's tab order: it is reached from the row.
    expect(handle.tabIndex).toBe(-1);
    expect(widths(target)).toEqual([null, null, null]);
  });

  it("leaves Tab to the editor when the caret is in text", () => {
    const target = createEditor(column("a"), column("b"));
    target.commands.focus("end");
    press(target.view.dom, "Tab");
    expect(document.activeElement).not.toBe(bar());
  });

  it("steps with the arrow keys, further with Shift, and writes once when focus leaves", () => {
    const target = createEditor(column("a"), column("b"));
    selectRow(target);
    press(target.view.dom, "Tab");
    const handle = bar()!;
    expect(press(handle, "ArrowRight")).toBe(true);
    expect(handle.getAttribute("aria-valuenow")).toBe(String(50 + COLUMN_RESIZE_STEP));
    press(handle, "ArrowRight", { shiftKey: true });
    expect(handle.getAttribute("aria-valuenow")).toBe(
      String(50 + COLUMN_RESIZE_STEP + COLUMN_RESIZE_STEP_LARGE),
    );
    press(handle, "ArrowLeft");
    const left = 50 + COLUMN_RESIZE_STEP_LARGE;
    expect(handle.getAttribute("aria-valuenow")).toBe(String(left));
    // A preview: drawn, not yet in the document.
    expect(widths(target)).toEqual([null, null]);
    const first = target.view.dom.querySelector<HTMLElement>('[data-type="column"]')!;
    expect(first.style.flexGrow).toBe(String(left));

    expect(press(handle, "Escape")).toBe(true);
    expect(widths(target)).toEqual([left, 100 - left]);
    expect(target.view.hasFocus()).toBe(true);
    expect(handle.hidden).toBe(true);
    // The caret is back in the text, at the end of the column left of the gap.
    const { $from } = target.state.selection;
    expect($from.parent.textContent).toBe("a");
    expect($from.parentOffset).toBe(1);

    // The whole run is one undo step.
    target.commands.undo();
    expect(widths(target)).toEqual([null, null]);
  });

  it("stops at the minimum width; Home and End go to it", () => {
    const target = createEditor(column("a"), column("b"));
    selectRow(target);
    press(target.view.dom, "Tab");
    const handle = bar()!;
    press(handle, "End");
    expect(handle.getAttribute("aria-valuenow")).toBe("90");
    press(handle, "ArrowRight", { shiftKey: true });
    expect(handle.getAttribute("aria-valuenow")).toBe("90");
    press(handle, "Home");
    expect(handle.getAttribute("aria-valuenow")).toBe("10");
    press(handle, "Escape");
    expect(widths(target)).toEqual([10, 90]);
  });

  it("Tab moves through the gaps and then back into the text", () => {
    const target = createEditor(column("a", 20), column("b", 30), column("c", 50));
    selectRow(target);
    press(target.view.dom, "Tab");
    const handle = bar()!;
    press(handle, "ArrowLeft");
    press(handle, "Tab");
    expect(document.activeElement).toBe(handle);
    expect(handle.getAttribute("aria-label")).toBe("Resize columns 2 and 3");
    press(handle, "ArrowRight");
    // Still one run: nothing written yet.
    expect(widths(target)).toEqual([20, 30, 50]);
    press(handle, "Tab");
    expect(target.view.hasFocus()).toBe(true);
    expect(target.state.selection.$from.parent.textContent).toBe("c");
    expect(widths(target)).toEqual([18, 34, 48]);
    target.commands.undo();
    expect(widths(target)).toEqual([20, 30, 50]);
  });

  it("writes nothing for a run that ends where it started", () => {
    const target = createEditor(column("a"), column("b"));
    selectRow(target);
    press(target.view.dom, "Tab");
    const handle = bar()!;
    press(handle, "ArrowRight");
    press(handle, "ArrowLeft");
    const before = target.state.doc;
    press(handle, "Escape");
    expect(target.state.doc.eq(before)).toBe(true);
  });

  it("does nothing in a read-only editor", () => {
    const target = createEditor(column("a"), column("b"));
    selectRow(target);
    target.setEditable(false);
    press(target.view.dom, "Tab");
    expect(document.activeElement).not.toBe(bar());
  });
});

describe("stacked columns (a narrow editor)", () => {
  let observed: (() => void)[] = [];
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
    observed = [];
  });

  // Stands in for ResizeObserver, which happy-dom never calls back: the test calls it.
  function fakeResizeObserver() {
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        observed.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    restore = () => (globalThis.ResizeObserver = original);
  }

  it("stacks below 40rem of its own width, and says so on the root", () => {
    fakeResizeObserver();
    const target = createEditor(column("a"), column("b"));
    let width = 500;
    Object.defineProperty(target.view.dom, "clientWidth", { get: () => width });
    for (const callback of observed) callback();
    expect(columnsStacked(target.state)).toBe(true);
    expect(target.view.dom.getAttribute("data-columns")).toBe("stacked");
    width = 800;
    for (const callback of observed) callback();
    expect(columnsStacked(target.state)).toBe(false);
    expect(target.view.dom.hasAttribute("data-columns")).toBe(false);
  });

  it("offers no resize bar, and Tab leaves the selected row alone", () => {
    const target = createEditor(column("a"), column("b"));
    setColumnsStacked(target.view, true);
    selectRow(target);
    const before = target.state.doc;
    expect(press(target.view.dom, "Tab")).toBe(true);
    expect(document.activeElement).not.toBe(bar());
    expect(target.state.doc.eq(before)).toBe(true);
  });

  it("drops a keyboard run when the row stacks under the bar", async () => {
    const target = createEditor(column("a"), column("b"));
    selectRow(target);
    press(target.view.dom, "Tab");
    press(bar()!, "ArrowRight");
    setColumnsStacked(target.view, true);
    await Promise.resolve();
    expect(bar()!.hidden).toBe(true);
    expect(target.view.hasFocus()).toBe(true);
    expect(widths(target)).toEqual([null, null]);
  });
});
