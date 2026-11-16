import { fuzzyScoreLower } from "@lydie/plugin-api";

export type Usage = Record<string, { count: number; last: number }>;

export type Candidate = {
  id: string;
  title: string;
  path: string;
  icon?: string | null;
  updatedAt?: string;
  // Lowercased once (`withKeys`) rather than on every keystroke.
  keys?: MatchKeys;
};

type MatchKeys = { title: string; full: string | null };

const keysOf = (c: Candidate): MatchKeys => ({
  title: c.title.toLowerCase(),
  full: c.path ? `${c.path} / ${c.title}`.toLowerCase() : null,
});

export const withKeys = (c: Candidate): Candidate => ({ ...c, keys: keysOf(c) });

// How many documents an empty query suggests.
export const SUGGESTIONS = 8;

const DAY = 24 * 60 * 60 * 1000;

// Frecency: opens count, recent opens count more (half-life of a week).
export function frecency(entry: { count: number; last: number } | undefined, now: number): number {
  if (!entry) return 0;
  const age = Math.max(0, now - entry.last);
  return Math.log2(1 + entry.count) * Math.pow(0.5, age / (7 * DAY));
}

// How well `query` (trimmed and lowercased) matches a candidate: its title, or its path and title
// ("work/road" finds Roadmap in Work), the path match counting less. The title ends the full
// text, so what does not match the full text does not match the title either.
export function matchScore(query: string, c: Candidate): number | null {
  const keys = c.keys ?? keysOf(c);
  if (keys.full === null) return fuzzyScoreLower(query, keys.title);
  const full = fuzzyScoreLower(query, keys.full);
  if (full === null) return null;
  const title = fuzzyScoreLower(query, keys.title);
  return title === null ? full - 150 : Math.max(title, full - 150);
}

// What an empty query shows: the documents opened most (frecency), then, on a device that has
// opened few, the most recently edited.
export function suggest(
  candidates: readonly Candidate[],
  usage: Usage,
  now: number,
  limit = SUGGESTIONS,
): Candidate[] {
  const opened = candidates
    .filter((c) => usage[c.id])
    .sort(
      (a, b) =>
        frecency(usage[b.id], now) - frecency(usage[a.id], now) ||
        usage[b.id]!.last - usage[a.id]!.last,
    )
    .slice(0, limit);
  if (opened.length === limit) return opened;
  const rest = candidates
    .filter((c) => !usage[c.id])
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit - opened.length);
  return [...opened, ...rest];
}

// Ranks candidates by fuzzy match, boosted by frecency. An empty query suggests a few.
export function rank(
  candidates: readonly Candidate[],
  query: string,
  usage: Usage,
  now: number,
  limit = 50,
): Candidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return suggest(candidates, usage, now, Math.min(limit, SUGGESTIONS));
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
