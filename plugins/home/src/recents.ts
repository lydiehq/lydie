// What the home page knows besides the database: the documents opened on this device, per
// workspace, newest first. Recorded whenever a document becomes the focused tab.
import { fuzzyScoreLower } from "@lydie/plugin-api";

export type Opened = { id: string; at: number };

export const RECENT_LIMIT = 50;

export const recentKey = (workspaceId: string) => `recent:${workspaceId}`;

export function recordOpen(
  list: readonly Opened[],
  id: string,
  now: number,
  max = RECENT_LIMIT,
): Opened[] {
  return [{ id, at: now }, ...list.filter((o) => o.id !== id)].slice(0, max);
}

export function forget(list: readonly Opened[], id: string): Opened[] {
  return list.filter((o) => o.id !== id);
}

// "Jump back in": what you opened here, newest first, then what changed lately that you have not
// opened (another device, a teammate, a fresh install).
export function jumpList(
  opened: readonly Opened[],
  changed: readonly { id: string }[],
  limit: number,
): string[] {
  const ids = opened.slice(0, limit).map((o) => o.id);
  for (const doc of changed) {
    if (ids.length >= limit) break;
    if (!ids.includes(doc.id)) ids.push(doc.id);
  }
  return ids;
}

export type Candidate = {
  id: string;
  title: string;
  path: string;
  icon?: string | null;
  // Lowercased once (`withKeys`) rather than on every keystroke.
  keys?: MatchKeys;
};

type MatchKeys = { title: string; full: string | null };

const keysOf = (c: Candidate): MatchKeys => ({
  title: c.title.toLowerCase(),
  full: c.path ? `${c.path} / ${c.title}`.toLowerCase() : null,
});

export const withKeys = (c: Candidate): Candidate => ({ ...c, keys: keysOf(c) });

// Title matches for the find box: fuzzy on the title (or on the path and title, counting less),
// lifted by how recently the document was opened here.
export function rankTitles(
  candidates: readonly Candidate[],
  query: string,
  opened: readonly Opened[],
  limit: number,
): Candidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const recency = new Map(opened.map((o, i) => [o.id, i]));
  const scored: { c: Candidate; score: number }[] = [];
  for (const c of candidates) {
    const keys = c.keys ?? keysOf(c);
    // The title ends the full text: what does not match that does not match the title either.
    const full = keys.full === null ? null : fuzzyScoreLower(q, keys.full);
    if (keys.full !== null && full === null) continue;
    const title = fuzzyScoreLower(q, keys.title);
    const match =
      title === null ? (full === null ? null : full - 150) : Math.max(title, (full ?? 0) - 150);
    if (match === null) continue;
    const rank = recency.get(c.id);
    scored.push({ c, score: match + (rank === undefined ? 0 : 100 - rank) });
  }
  scored.sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title));
  return scored.slice(0, limit).map((x) => x.c);
}

// "<mark>" runs of a search snippet, as text parts (never parsed as HTML).
export function snippetParts(snippet: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  const pattern = /<mark>([\s\S]*?)<\/mark>/g;
  let at = 0;
  for (const match of snippet.matchAll(pattern)) {
    if (match.index > at) parts.push({ text: snippet.slice(at, match.index), mark: false });
    if (match[1]) parts.push({ text: match[1], mark: true });
    at = match.index + match[0].length;
  }
  if (at < snippet.length) parts.push({ text: snippet.slice(at), mark: false });
  return parts;
}

// "just now", "5m ago", "3h ago", "yesterday", "4d ago", then the date.
export function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
