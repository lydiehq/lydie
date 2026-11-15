import { fuzzyScore } from "@lydie/plugin-api";
import type { SlashCommandItem } from "@lydie/plugin-api";

// Item id → when it was last used (ms), per device.
export type SlashRecents = Record<string, number>;

// Commands from the registry are many: they show only once the user types.
const COMMANDS = "Commands";
const RECENT_SHOWN = 5;

function score(item: SlashCommandItem, query: string): number | null {
  const title = fuzzyScore(query, item.title);
  let best = title;
  for (const word of item.keywords ?? []) {
    const s = fuzzyScore(query, word);
    // A keyword match ranks below a title prefix match (an exact keyword scores 850).
    if (s !== null && (best === null || s - 150 > best)) best = s - 150;
  }
  // Blocks before commands for equal matches.
  return best === null ? null : best - (item.group === COMMANDS ? 120 : 0);
}

// The `/` menu: with no query, the recently used items first, then the rest in their order; with a
// query, fuzzy matches on title and keywords, recent use breaking near ties.
export function rankSlash(
  items: readonly SlashCommandItem[],
  query: string,
  recents: SlashRecents,
): SlashCommandItem[] {
  const q = query.trim();
  if (!q) {
    const visible = items.filter((i) => i.group !== COMMANDS);
    const recent = visible
      .filter((i) => recents[i.id])
      .sort((a, b) => recents[b.id]! - recents[a.id]!)
      .slice(0, RECENT_SHOWN);
    return [...recent, ...visible.filter((i) => !recent.includes(i))];
  }
  const now = Math.max(0, ...Object.values(recents));
  const scored: { item: SlashCommandItem; s: number }[] = [];
  for (const item of items) {
    const s = score(item, q);
    if (s === null) continue;
    const used = recents[item.id];
    // Up to +40 for the most recent use, fading over the last 50 uses' span.
    const bonus = used ? 40 * Math.max(0, 1 - (now - used) / (1000 * 60 * 60 * 24 * 14)) : 0;
    scored.push({ item, s: s + bonus });
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.item);
}

export function recordSlashUse(recents: SlashRecents, id: string, now: number, max = 50) {
  const next = { ...recents, [id]: now };
  const ids = Object.keys(next);
  if (ids.length > max) {
    ids.sort((a, b) => next[a]! - next[b]!);
    for (const old of ids.slice(0, ids.length - max)) delete next[old];
  }
  return next;
}
