// The changelog's entries, also read by lydie.co/changelog. One file per entry,
// `<yyyy-mm-dd>-<slug>.ts`, listed here.
import type { ChangelogEntry } from "../types.ts";
import { lydieV2 } from "./2026-11-15-lydie-v2.ts";

// Newest first; entries on the same day keep the order listed here.
export const changelogEntries: readonly ChangelogEntry[] = [lydieV2].sort((a, b) =>
  b.date.localeCompare(a.date),
);

export const CHANGELOG_URL = "https://lydie.co/changelog";

// Splits text into plain runs and `code` spans.
export function segments(text: string): { text: string; code: boolean }[] {
  return text
    .split("`")
    .map((part, i) => ({ text: part, code: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}

export type { ChangelogEntry, ChangelogSection } from "../types.ts";
