// What an incremental decoration plugin rescans after a transaction, instead of the whole document.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

// Where a transaction changed the document, as [from, to] in its final positions. Steps that move
// nothing (a mark added or removed, a node's attributes) map no range, so the range they touch is
// taken from the step itself.
export function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.steps.forEach((step, i) => {
    const rest = tr.mapping.slice(i + 1);
    let mapped = false;
    step.getMap().forEach((_oldStart, _oldEnd, from, to) => {
      mapped = true;
      ranges.push([rest.map(from, -1), rest.map(to, 1)]);
    });
    if (mapped) return;
    const { from, to, pos } = step as unknown as { from?: number; to?: number; pos?: number };
    if (typeof pos === "number") ranges.push([rest.map(pos, -1), rest.map(pos, 1) + 1]);
    else if (typeof from === "number" && typeof to === "number") {
      ranges.push([rest.map(from, -1), rest.map(to, 1)]);
    }
  });
  return ranges;
}

// The textblocks a transaction touched, each once, in the final document: those a changed range
// overlaps, and those one position either side of it (a block joined to or split from its
// neighbour, or one whose node or attributes changed). Whatever a plugin decorates inside other
// textblocks is only mapped.
export function changedTextblocks(tr: Transaction): { node: ProseMirrorNode; pos: number }[] {
  const doc = tr.doc;
  const size = doc.content.size;
  const seen = new Set<number>();
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  for (const [from, to] of changedRanges(tr)) {
    doc.nodesBetween(Math.max(0, from - 1), Math.min(size, to + 1), (node, pos) => {
      if (!node.isTextblock) return true;
      if (!seen.has(pos)) {
        seen.add(pos);
        found.push({ node, pos });
      }
      return false;
    });
  }
  return found.sort((a, b) => a.pos - b.pos);
}
