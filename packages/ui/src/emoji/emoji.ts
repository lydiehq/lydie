// Every emoji with its name and search words, by group. The data (emoji-data.json, written by
// scripts/build-emoji.ts) is its own chunk, fetched the first time a picker asks.

export type Emoji = { emoji: string; name: string; tags: string };
export type EmojiGroup = { name: string; emojis: Emoji[] };

let loading: Promise<EmojiGroup[]> | null = null;

export function loadEmoji(): Promise<EmojiGroup[]> {
  loading ??= import("./emoji-data.json").then((data) =>
    (data.default as { name: string; emojis: string[][] }[]).map((group) => ({
      name: group.name,
      emojis: group.emojis.map(([emoji = "", name = "", tags = ""]) => ({ emoji, name, tags })),
    })),
  );
  return loading;
}

// The same emoji with or without the "draw as emoji" selector.
const bare = (text: string) => text.replaceAll("️", "");

// Emoji with a word starting with every word of the query, best first: the name itself, a name starting with the
// query, a word of the name starting with one, then the search words. A pasted emoji finds itself.
export function searchEmoji(groups: readonly EmojiGroup[], query: string, limit = 240): Emoji[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const pasted = bare(q);
  const ranked: { emoji: Emoji; rank: number }[] = [];
  for (const group of groups) {
    for (const emoji of group.emojis) {
      if (bare(emoji.emoji) === pasted) {
        ranked.push({ emoji, rank: -1 });
        continue;
      }
      const name = emoji.name.toLowerCase();
      const text = ` ${name} ${emoji.tags}`;
      let rank = 0;
      for (const word of words) {
        if (name.startsWith(word)) rank += name === q ? 0 : 1;
        else if (` ${name}`.includes(` ${word}`)) rank += 2;
        else if (text.includes(` ${word}`)) rank += 3;
        else {
          rank = -2;
          break;
        }
      }
      if (rank !== -2) ranked.push({ emoji, rank });
    }
  }
  // A stable sort: emoji of one rank stay in the standard's order.
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.emoji);
}
