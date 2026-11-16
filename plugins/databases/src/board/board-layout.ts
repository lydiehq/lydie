// Where a board column's cards sit, so a column renders only the cards near its viewport and
// finds a drop's place without measuring every card: heights measured as cards render, an
// estimate for the rest.

export type CardLayout = {
  // tops[i]: where card i starts in the list's content; tops[n]: where one after them would.
  tops: number[];
  // The middle of each card: a drop above it goes before it.
  mids: number[];
};

export function cardLayout(
  ids: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimate: number,
  gap: number,
): CardLayout {
  const tops = [0];
  const mids: number[] = [];
  for (const id of ids) {
    const top = tops.at(-1)!;
    const height = heights.get(id) ?? estimate;
    mids.push(top + height / 2);
    tops.push(top + height + gap);
  }
  return { tops, mids };
}

// The first index whose value is greater than `y` (values ascending), or their count.
export function firstAbove(values: readonly number[], y: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! > y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// The cards [start, end) that overlap [from, to) of the list's content.
export function cardRange(tops: readonly number[], from: number, to: number) {
  const count = tops.length - 1;
  return {
    start: Math.max(0, Math.min(count, firstAbove(tops, from) - 1)),
    end: Math.min(count, firstAbove(tops, to)),
  };
}

// The room before card `start` and after card `end - 1` that the cards not rendered take, as
// spacers in the list's flow (which puts `gap` after each of them).
export function spacers(tops: readonly number[], start: number, end: number, gap: number) {
  const count = tops.length - 1;
  return {
    before: start > 0 ? tops[start]! - gap : 0,
    after: end < count ? tops[count]! - tops[end]! - gap : 0,
  };
}
