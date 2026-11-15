// Windowing arithmetic for virtualised lists and grids: which items are on screen, and which window
// of a query to ask for (aligned to pages so scrolling changes it rarely).

export const PAGE = 100;
// The contract's largest window.
export const MAX_WINDOW = 1000;

export type Range = { start: number; end: number };

export function visibleRange(
  scrollTop: number,
  viewport: number,
  itemHeight: number,
  count: number,
  overscan = 8,
): Range {
  if (count === 0) return { start: 0, end: 0 };
  const first = Math.floor(scrollTop / itemHeight);
  const last = Math.ceil((scrollTop + viewport) / itemHeight);
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + overscan) };
}

// Rows [first, last) of the ordered result are needed: the window to fetch, a page either side.
export function windowFor(
  first: number,
  last: number,
  total?: number,
): { offset: number; limit: number } {
  const offset = Math.max(0, Math.floor(first / PAGE) * PAGE - PAGE);
  let end = Math.ceil(Math.max(last, first + 1) / PAGE) * PAGE + PAGE;
  if (total !== undefined) end = Math.min(end, Math.max(total, offset + PAGE));
  return { offset, limit: Math.min(MAX_WINDOW, Math.max(PAGE, end - offset)) };
}

export function prefixSums(widths: readonly number[]): number[] {
  const out = [0];
  for (const w of widths) out.push(out.at(-1)! + w);
  return out;
}

// The last index i with offsets[i] <= x (offsets ascending, from prefixSums).
export function indexAt(offsets: readonly number[], x: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Columns overlapping [scrollLeft, scrollLeft + viewport) (offsets from prefixSums), plus overscan.
export function visibleColumns(
  offsets: readonly number[],
  scrollLeft: number,
  viewport: number,
  overscan = 2,
): Range {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const start = Math.min(count - 1, indexAt(offsets, Math.max(0, scrollLeft)));
  let end = start;
  while (end < count && offsets[end]! < scrollLeft + viewport) end++;
  return { start: Math.max(0, start - overscan), end: Math.min(count, end + overscan) };
}
