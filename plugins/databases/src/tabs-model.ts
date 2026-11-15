// Which view tabs fit on the bar. Tabs keep their order; those that do not fit go under
// "N more…", and the open view always shows (in its own place among the ones that fit).

export type TabFit = {
  // Indices of the tabs to show, in order.
  shown: number[];
  // Indices under "N more…", in order; empty when everything fits.
  hidden: number[];
};

export function fitTabs({
  widths,
  available,
  moreWidth,
  gap,
  active,
}: {
  widths: readonly number[];
  available: number;
  moreWidth: number;
  gap: number;
  active: number;
}): TabFit {
  const all = widths.map((_, i) => i);
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
  if (total <= available) return { shown: all, hidden: [] };
  // The open view first (even when it alone is too wide), then the others from the left until
  // one does not fit: skipping a wide tab for a narrower one after it would reorder them.
  const budget = available - moreWidth - gap;
  const shown = new Set(active >= 0 && active < widths.length ? [active] : []);
  let used = active >= 0 ? (widths[active] ?? 0) : -gap;
  for (const i of all) {
    if (i === active) continue;
    const next = used + gap + widths[i]!;
    if (next > budget) break;
    shown.add(i);
    used = next;
  }
  return { shown: all.filter((i) => shown.has(i)), hidden: all.filter((i) => !shown.has(i)) };
}
