import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

import { sideLine } from "./column-layout";
import { refusesDrop, sideTargetAt } from "./columns";

// What a drag looks like inside the editor: the line where it will land (`.lydie-drop-indicator`;
// upright, `data-kind="column"`, beside a block it would make a column of) and the dragged blocks
// dimmed in place (`.lydie-drag-source`); both styled in editor-content.css.
//
// The line replaces StarterKit's dropcursor, whose positioning it follows (prosemirror-dropcursor,
// MIT). That one spans a block's border box, and top-level blocks carry the column's padding, so it
// overshot the text by 1rem each side (5rem at full width); this one spans the content box.

const BLOCK_THICKNESS = 3;
const INLINE_THICKNESS = 2;

const dragSourceKey = new PluginKey<DecorationSet>("lydieDragSource");

// Dims the blocks between `from` and `to` (top-level or not: whole nodes inside the range), or
// clears them with null. Not an edit: no undo step, nothing saved.
export function setDragSource(view: EditorView, range: { from: number; to: number } | null) {
  view.dispatch(view.state.tr.setMeta(dragSourceKey, range).setMeta("addToHistory", false));
}

function sourceDecorations(state: EditorState, range: { from: number; to: number }) {
  const decorations: Decoration[] = [];
  state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (pos < range.from || pos + node.nodeSize > range.to) return true;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "lydie-drag-source" }));
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}

const dragSource = () =>
  new Plugin<DecorationSet>({
    key: dragSourceKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr: Transaction, set: DecorationSet, _old: EditorState, state: EditorState) {
        const range = tr.getMeta(dragSourceKey) as { from: number; to: number } | null | undefined;
        if (range === undefined) return set.map(tr.mapping, tr.doc);
        return range ? sourceDecorations(state, range) : DecorationSet.empty;
      },
    },
    props: {
      decorations: (state) => dragSourceKey.getState(state),
    },
  });

class DropIndicatorView {
  private pos: number | null = null;
  // Set instead of `pos` while the drop would go beside a block (columns).
  private side: { x: number; top: number; bottom: number } | null = null;
  private element: HTMLElement | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private lastDragEvent: DragEvent | null = null;
  private readonly handlers: { name: string; handler: (event: Event) => void }[];

  constructor(private readonly view: EditorView) {
    const on = {
      dragover: (event: DragEvent) => this.dragover(event),
      dragend: () => this.scheduleRemoval(20),
      drop: () => this.scheduleRemoval(20),
      dragleave: (event: DragEvent) => {
        if (!view.dom.contains(event.relatedTarget as Node | null)) this.setPos(null);
      },
    };
    this.handlers = Object.entries(on).map(([name, handler]) => {
      const listener = handler as (event: Event) => void;
      view.dom.addEventListener(name, listener);
      return { name, handler: listener };
    });
  }

  destroy() {
    clearTimeout(this.timeout);
    this.setPos(null);
    for (const { name, handler } of this.handlers) this.view.dom.removeEventListener(name, handler);
  }

  update(view: EditorView, prev: EditorState) {
    if (prev.doc === view.state.doc) return;
    if (this.side && this.lastDragEvent) {
      this.dragover(this.lastDragEvent);
      return;
    }
    if (this.pos === null) return;
    const found = this.lastDragEvent ? this.target(this.lastDragEvent) : this.pos;
    const target = found === "refused" ? null : found;
    if (target === this.pos) this.draw();
    else this.setPos(target);
  }

  private dragover(event: DragEvent) {
    if (!this.view.editable) return;
    this.lastDragEvent = event;
    const beside = sideTargetAt(this.view, { x: event.clientX, y: event.clientY });
    if (beside) {
      this.side = sideLine({ side: beside.target.side, box: beside.box });
      this.pos = null;
      this.draw();
      this.scheduleRemoval(5000);
      return;
    }
    if (this.side) {
      this.side = null;
      this.element?.remove();
      this.element = null;
    }
    const target = this.target(event);
    if (target === "refused") {
      this.setPos(null);
      return;
    }
    if (target === null) return;
    this.setPos(target);
    this.scheduleRemoval(5000);
  }

  private scheduleRemoval(ms: number) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.setPos(null), ms);
  }

  // "refused": a drop there is not allowed (a row of columns inside a column).
  private target(event: DragEvent): number | "refused" | null {
    const { view } = this;
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!pos) return null;
    const node = pos.inside >= 0 ? view.state.doc.nodeAt(pos.inside) : null;
    const disable = node?.type.spec.disableDropCursor as
      | boolean
      | ((view: EditorView, pos: { pos: number; inside: number }, event: DragEvent) => boolean)
      | undefined;
    if (typeof disable === "function" ? disable(view, pos, event) : disable) return null;
    const slice = view.dragging?.slice;
    const point = (slice && dropPoint(view.state.doc, pos.pos, slice)) ?? pos.pos;
    return slice && refusesDrop(view.state.doc, point, slice) ? "refused" : point;
  }

  private setPos(pos: number | null) {
    if (pos === this.pos && !this.side) return;
    this.pos = pos;
    if (pos === null) {
      this.side = null;
      this.element?.remove();
      this.element = null;
      this.lastDragEvent = null;
    } else {
      this.draw();
    }
  }

  private draw() {
    const { view } = this;
    let kind: "block" | "inline" | "column";
    let rect: { left: number; right: number; top: number; bottom: number } | null = null;
    if (this.side) {
      kind = "column";
      rect = {
        left: this.side.x - BLOCK_THICKNESS / 2,
        right: this.side.x + BLOCK_THICKNESS / 2,
        top: this.side.top,
        bottom: this.side.bottom,
      };
    } else if (this.pos === null) {
      return;
    } else {
      const $pos = view.state.doc.resolve(this.pos);
      kind = $pos.parent.inlineContent ? "inline" : "block";
      rect = this.lineAt(this.pos, kind === "block");
    }
    this.place(rect, kind);
  }

  private lineAt(at: number, block: boolean) {
    const { view } = this;
    const $pos = view.state.doc.resolve(at);
    let rect: { left: number; right: number; top: number; bottom: number } | null = null;
    if (block && ($pos.nodeBefore || $pos.nodeAfter)) {
      const before = $pos.nodeBefore;
      const dom = view.nodeDOM(at - (before ? before.nodeSize : 0));
      if (dom instanceof HTMLElement) {
        const box = dom.getBoundingClientRect();
        const style = getComputedStyle(dom);
        let y = before ? box.bottom : box.top;
        const next = before && $pos.nodeAfter ? view.nodeDOM(at) : null;
        if (next instanceof HTMLElement) y = (y + next.getBoundingClientRect().top) / 2;
        rect = {
          left: box.left + Number.parseFloat(style.paddingLeft),
          right: box.right - Number.parseFloat(style.paddingRight),
          top: y - BLOCK_THICKNESS / 2,
          bottom: y + BLOCK_THICKNESS / 2,
        };
      }
    }
    if (!rect) {
      const coords = view.coordsAtPos(at);
      rect = {
        left: coords.left - INLINE_THICKNESS / 2,
        right: coords.left + INLINE_THICKNESS / 2,
        top: coords.top,
        bottom: coords.bottom,
      };
    }
    return rect;
  }

  private place(
    rect: { left: number; right: number; top: number; bottom: number },
    kind: "block" | "inline" | "column",
  ) {
    const { view } = this;
    const parent = view.dom.offsetParent as HTMLElement | null;
    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "lydie-drop-indicator";
      (parent ?? document.body).append(this.element);
    }
    this.element.dataset.kind = kind;
    let originX = -window.scrollX;
    let originY = -window.scrollY;
    if (parent) {
      const box = parent.getBoundingClientRect();
      originX = box.left - parent.scrollLeft;
      originY = box.top - parent.scrollTop;
    }
    Object.assign(this.element.style, {
      left: `${rect.left - originX}px`,
      top: `${rect.top - originY}px`,
      width: `${rect.right - rect.left}px`,
      height: `${rect.bottom - rect.top}px`,
    });
  }
}

export const DragFeedback = Extension.create({
  name: "dragFeedback",
  addProseMirrorPlugins() {
    return [new Plugin({ view: (view) => new DropIndicatorView(view) }), dragSource()];
  },
});
