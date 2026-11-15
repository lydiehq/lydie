import type { Editor } from "@tiptap/core";

import { setDragSource } from "../extensions/drag-feedback";

// Room around the card for its shadow: a drag image is cut at the element's box.
const SHADOW_ROOM = 16;

// Runs after TipTap's own dragstart handler (which picked the blocks, selected them and set
// `view.dragging`) and replaces its drag image, a bare clone of the blocks, with a card that lifts
// off where the blocks were. setDragImage's last call wins. The blocks themselves dim until the
// drag ends.
export function startBlockDrag(editor: Editor, event: DragEvent) {
  const { view } = editor;
  const transfer = event.dataTransfer;
  if (!transfer || !view.dragging) return;
  const { from, to } = view.state.selection;
  const blocks: HTMLElement[] = [];
  view.state.doc.nodesBetween(from, to, (node, pos) => {
    if (pos < from || pos + node.nodeSize > to) return true;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) blocks.push(dom);
    return false;
  });
  const first = blocks[0];
  if (!first) return;

  const box = first.getBoundingClientRect();
  const outer = document.createElement("div");
  outer.style.cssText = `position: fixed; top: -10000px; left: 0; padding: ${String(SHADOW_ROOM)}px; pointer-events: none;`;
  const card = document.createElement("div");
  card.className = "editor-content lydie-drag-preview";
  card.style.width = `${String(box.width)}px`;
  for (const block of blocks) card.append(block.cloneNode(true));
  outer.append(card);
  document.body.append(outer);
  if (card.scrollHeight > card.clientHeight) card.dataset.overflow = "";
  transfer.setDragImage(
    outer,
    event.clientX - box.left + SHADOW_ROOM,
    event.clientY - box.top + SHADOW_ROOM,
  );
  setDragSource(view, { from, to });

  const end = () => {
    outer.remove();
    if (!editor.isDestroyed) setDragSource(view, null);
    document.removeEventListener("dragend", end, true);
    document.removeEventListener("drop", end, true);
  };
  document.addEventListener("dragend", end, true);
  document.addEventListener("drop", end, true);
}
