// Text three-way merge: line-level diff3, with a word-level retry for conflicting hunks (two edits
// to different words of the same long line merge cleanly) and both-sides insertions kept.
import { diff3 } from "./diff";

export type TextConflict = {
  base: string;
  ours: string;
  theirs: string;
};

export type MergeResult =
  | { clean: true; text: string }
  | { clean: false; conflicts: TextConflict[]; marked: string };

export function splitLines(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\n|\r)|[^\r\n]+$/g) ?? [];
}

function splitWords(text: string): string[] {
  return text.match(/\r\n|\n|\r|[ \t]+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

// `ours` and `theirs` are both derived from `base`.
export function merge3(base: string, ours: string, theirs: string): MergeResult {
  if (ours === theirs) return { clean: true, text: ours };
  if (ours === base) return { clean: true, text: theirs };
  if (theirs === base) return { clean: true, text: ours };
  const regions = diff3(splitLines(base), splitLines(ours), splitLines(theirs));
  let text = "";
  let marked = "";
  const conflicts: TextConflict[] = [];
  for (const region of regions) {
    if ("ok" in region) {
      const ok = region.ok.join("");
      text += ok;
      marked += ok;
      continue;
    }
    const c = region.conflict;
    const o = c.o.join("");
    const a = c.a.join("");
    const b = c.b.join("");
    const words = mergeWords(o, a, b);
    if (words !== null) {
      text += words;
      marked += words;
      continue;
    }
    conflicts.push({ base: o, ours: a, theirs: b });
    const nl = (s: string) => (s === "" || /[\r\n]$/.test(s) ? s : s + "\n");
    marked += `<<<<<<< editor\n${nl(a)}=======\n${nl(b)}>>>>>>> disk\n`;
  }
  return conflicts.length ? { clean: false, conflicts, marked } : { clean: true, text };
}

function mergeWords(base: string, ours: string, theirs: string): string | null {
  // Both sides only added text at the same place: keep both, disk first.
  if (base === "") return theirs + ours;
  let out = "";
  for (const region of diff3(splitWords(base), splitWords(ours), splitWords(theirs))) {
    if (!("ok" in region)) return null;
    out += region.ok.join("");
  }
  return out;
}
