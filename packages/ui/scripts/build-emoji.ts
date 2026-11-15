// Writes src/emoji/emoji-data.json: every emoji with its name and search words, by group, from
// emojibase-data (MIT, https://emojibase.dev). Run `bun run generate:emoji` in this package to
// refresh it; the file is committed, so the app needs no emoji dependency.
const VERSION = "16.0.3";
// Newer emoji are left out: systems a few years old draw them as empty boxes.
const NEWEST = 15.1;

type Source = {
  emoji: string;
  label: string;
  tags?: string[];
  group?: number;
  order?: number;
  version: number;
};

// emojibase's group numbers; 2 is "components" (skin tones, hair), which are not emoji to pick.
const GROUPS: [name: string, sources: number[]][] = [
  ["Smileys and people", [0, 1]],
  ["Animals and nature", [3]],
  ["Food and drink", [4]],
  ["Travel and places", [5]],
  ["Activities", [6]],
  ["Objects", [7]],
  ["Symbols", [8]],
  ["Flags", [9]],
];

const response = await fetch(`https://cdn.jsdelivr.net/npm/emojibase-data@${VERSION}/en/data.json`);
if (!response.ok) throw new Error(`emojibase-data: ${response.status}`);
const all = ((await response.json()) as Source[])
  .filter((e) => e.group !== undefined && e.order !== undefined && e.version <= NEWEST)
  .sort((a, b) => a.order! - b.order!);

const groups = GROUPS.map(([name, sources]) => ({
  name,
  // [emoji, name, search words not already in the name]
  emojis: all
    .filter((e) => sources.includes(e.group!))
    .map((e) => {
      const words = new Set(e.label.toLowerCase().split(/[^a-z0-9]+/));
      const tags = (e.tags ?? []).filter((tag) => !words.has(tag.toLowerCase()));
      return [e.emoji, e.label, tags.join(" ")];
    }),
}));

const file = new URL("../src/emoji/emoji-data.json", import.meta.url).pathname;
await Bun.write(file, `${JSON.stringify(groups)}\n`);
console.log(groups.map((g) => `${g.name}: ${g.emojis.length}`).join("\n"));
