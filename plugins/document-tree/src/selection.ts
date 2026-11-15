import type { ChildEntry, DocumentTreeDropTarget } from "@lydie/plugin-api";

import type { TreeRow } from "./tree-model.ts";

// The documents from one row to another in row order, both included (Shift+click, Shift+arrow).
// Without the first row (scrolled away, collapsed) only the second. Views are not documents and
// are left out.
export function rangeIds(rows: readonly TreeRow[], fromId: string, toId: string): string[] {
  const from = rows.findIndex((r) => r.id === fromId);
  const to = rows.findIndex((r) => r.id === toId);
  if (to === -1) return [];
  if (from === -1) return rows[to]?.kind === "doc" ? [toId] : [];
  const [start, end] = from < to ? [from, to] : [to, from];
  return rows
    .slice(start, end + 1)
    .filter((r) => r.kind === "doc")
    .map((r) => r.id);
}

// The selected documents without those inside another selected one, in row order: moving or
// deleting a document takes its subtree along.
export function topmost(rows: readonly TreeRow[], ids: ReadonlySet<string>): ChildEntry[] {
  const out: ChildEntry[] = [];
  let coveredDepth: number | null = null;
  for (const row of rows) {
    if (coveredDepth !== null && row.depth > coveredDepth) continue;
    coveredDepth = null;
    if (row.kind === "doc" && ids.has(row.id)) {
      out.push(row.doc);
      coveredDepth = row.depth;
    }
  }
  return out;
}

// Whether a row is one of the documents or inside one of them (a drop there would move a
// document into itself).
export function withinAny(rows: readonly TreeRow[], id: string, ids: readonly string[]): boolean {
  const dragged = new Set(ids);
  let index = rows.findIndex((r) => r.id === id);
  let depth = Infinity;
  for (; index >= 0; index--) {
    const row = rows[index];
    if (!row || row.depth >= depth) continue;
    if (dragged.has(row.id)) return true;
    depth = row.depth;
  }
  return false;
}

// One `doc.move` placement per document, so they land together in their order. "After X" chains
// (each after the previous one); "before X" and appending keep the order as they are.
export function placements(
  ids: readonly string[],
  placement: DocumentTreeDropTarget,
): { id: string; placement: DocumentTreeDropTarget }[] {
  if (!placement.afterId) return ids.map((id) => ({ id, placement }));
  let afterId = placement.afterId;
  return ids.map((id) => {
    const step = { id, placement: { parentId: placement.parentId, afterId } };
    afterId = id;
    return step;
  });
}
