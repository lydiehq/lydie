import { fuzzyScore } from "@lydie/plugin-api";

export type Usage = Record<string, { count: number; last: number }>;

export type Candidate = { id: string; title: string; path: string; icon?: string | null };

const DAY = 24 * 60 * 60 * 1000;

// Frecency: opens count, recent opens count more (half-life of a week).
export function frecency(entry: { count: number; last: number } | undefined, now: number): number {
  if (!entry) return 0;
  const age = Math.max(0, now - entry.last);
  return Math.log2(1 + entry.count) * Math.pow(0.5, age / (7 * DAY));
}

// How well `query` matches a candidate: its title, or its path and title ("work/road" finds
// Roadmap in Work), the path match counting less.
export function matchScore(query: string, c: Candidate): number | null {
  const title = fuzzyScore(query, c.title);
  if (!c.path) return title;
  const full = fuzzyScore(query, `${c.path} / ${c.title}`);
  if (full === null) return title;
  return title === null ? full - 150 : Math.max(title, full - 150);
}

// Ranks candidates by fuzzy match, boosted by frecency. An empty query lists recent ones.
export function rank(
  candidates: readonly Candidate[],
  query: string,
  usage: Usage,
  now: number,
  limit = 50,
): Candidate[] {
  const q = query.trim();
  if (!q) {
    return candidates
      .filter((c) => usage[c.id])
      .sort((a, b) => usage[b.id]!.last - usage[a.id]!.last)
      .slice(0, limit);
  }
  const scored: { c: Candidate; score: number }[] = [];
  for (const c of candidates) {
    const s = matchScore(q, c);
    if (s === null) continue;
    // Heavy recent use can lift a substring match above a prefix match of an unused document.
    scored.push({ c, score: s + 250 * frecency(usage[c.id], now) });
  }
  scored.sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title));
  return scored.slice(0, limit).map((x) => x.c);
}

// Records an open, keeping the stats bounded.
export function recordOpen(usage: Usage, id: string, now: number, max = 2000): Usage {
  const next = { ...usage, [id]: { count: (usage[id]?.count ?? 0) + 1, last: now } };
  const ids = Object.keys(next);
  if (ids.length > max) {
    ids.sort((a, b) => next[a]!.last - next[b]!.last);
    for (const old of ids.slice(0, ids.length - max)) delete next[old];
  }
  return next;
}

// What the query asks for: documents, `#heading` (in the active note, or `Note#heading`), or
// `>command`.
export type SwitcherQuery =
  | { kind: "docs"; text: string }
  | { kind: "headings"; doc: string; text: string }
  | { kind: "commands"; text: string };

export function parseQuery(query: string): SwitcherQuery {
  const q = query.trimStart();
  if (q.startsWith(">")) return { kind: "commands", text: q.slice(1).trim() };
  const hash = q.indexOf("#");
  if (hash !== -1)
    return { kind: "headings", doc: q.slice(0, hash).trim(), text: q.slice(hash + 1).trim() };
  return { kind: "docs", text: q };
}
