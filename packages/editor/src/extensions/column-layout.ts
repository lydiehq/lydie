// The geometry behind column layouts, kept apart from ProseMirror and the DOM so it can be tested
// with plain numbers: where a dragged block lands beside another block, and how a column boundary
// moves when it is dragged.

export type Box = { left: number; right: number; top: number; bottom: number };
export type Point = { x: number; y: number };
export type Side = "left" | "right";

// A block the pointer can drop beside, with whatever the caller needs to find it again.
export type LayoutBlock<T> = { box: Box; key: T };
export type SideHit<T> = { key: T; side: Side; box: Box };

// The edge zones of a block, as in Notion: a band just inside its left edge, and its right edge
// together with the margin beyond it. Never left of the block: that is where the drag handle is,
// and a pointer there means "reorder". Narrow, so a reorder that drifts into the text stays one.
export const EDGE_ZONE = { fraction: 0.1, min: 24, max: 48, outside: 96 };

export function sideHit<T>(
  blocks: readonly LayoutBlock<T>[],
  point: Point,
  zone = EDGE_ZONE,
): SideHit<T> | null {
  let best: LayoutBlock<T> | null = null;
  let bestDistance = Infinity;
  for (const block of blocks) {
    const { box } = block;
    if (point.y < box.top || point.y > box.bottom) continue;
    const distance = Math.max(box.left - point.x, 0, point.x - box.right);
    if (distance < bestDistance) {
      best = block;
      bestDistance = distance;
    }
  }
  if (!best) return null;
  const { box } = best;
  const edge = Math.min(Math.max((box.right - box.left) * zone.fraction, zone.min), zone.max);
  if (point.x >= box.left && point.x <= box.left + edge) {
    return { key: best.key, side: "left", box };
  }
  if (point.x >= box.right - edge && point.x <= box.right + zone.outside) {
    return { key: best.key, side: "right", box };
  }
  return null;
}

// The vertical drop line for a hit: just outside the block's edge, as tall as the block.
export function sideLine(hit: { side: Side; box: Box }, offset = 4) {
  const x = hit.side === "left" ? hit.box.left - offset : hit.box.right + offset;
  return { x, top: hit.box.top, bottom: hit.box.bottom };
}

// What a width means is @lydie/markdown's, so pages drawn outside the editor agree with it.
export { columnShares } from "@lydie/markdown/columns";

export const MIN_COLUMN_SHARE = 10;

const round = (value: number) => Math.round(value * 10) / 10;

// Moves the boundary after column `index` by `dx` pixels, `total` being the summed pixel width of
// the columns. Only the two columns beside the boundary change; neither goes below `min` percent
// of the row. Shares are rounded to 0.1 so the Markdown stays short.
export function resizeColumns(
  shares: readonly number[],
  index: number,
  dx: number,
  total: number,
  min = MIN_COLUMN_SHARE,
): number[] {
  const left = shares[index];
  const right = shares[index + 1];
  if (left === undefined || right === undefined || total <= 0) return [...shares];
  const sum = shares.reduce((a, b) => a + b, 0);
  const pair = left + right;
  const delta = (dx / total) * sum;
  const lowest = Math.min(min * (sum / 100), pair / 2);
  const nextLeft = round(Math.min(Math.max(left + delta, lowest), pair - lowest));
  const next = [...shares];
  next[index] = nextLeft;
  next[index + 1] = round(pair - nextLeft);
  return next;
}
