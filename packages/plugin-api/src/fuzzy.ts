// Subsequence fuzzy matching for pickers. Returns null when `query` is not a subsequence of
// `text`; higher scores are better matches. Rewards consecutive characters, word starts and an
// early first match; an exact prefix wins over everything else.
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - t.length / 100;
  const contains = t.indexOf(q);
  let score = 0;
  let ti = 0;
  let previous = -2;
  let first = -1;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    if (first === -1) first = found;
    if (found === previous + 1) score += 5;
    const before = found === 0 ? " " : t[found - 1]!;
    if (/[\s\-_/.([]/.test(before)) score += 8;
    score += 1;
    previous = found;
    ti = found + 1;
  }
  if (contains !== -1) score += 300 - Math.min(contains, 100);
  return score - first / 10 - t.length / 200;
}

// Character ranges of `text` matched by `query` (for highlighting), or [] when it does not match.
export function fuzzyRanges(query: string, text: string): [number, number][] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at !== -1) return [[at, at + q.length]];
  const ranges: [number, number][] = [];
  let ti = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return [];
    const last = ranges.at(-1);
    if (last && last[1] === found) last[1] = found + 1;
    else ranges.push([found, found + 1]);
    ti = found + 1;
  }
  return ranges;
}
