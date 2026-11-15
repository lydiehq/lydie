// Turning an unlinked mention into a link: one exact `doc.updateBody` edit (an operation, so it is
// on the undo stack), against the Markdown the edit was computed from.

// Spans that are not plain text: links, embeds, code, frontmatter-like markup, URLs.
const SKIP = /\[\[[^\]]*\]\]|!?\[[^\]]*\]\([^)]*\)|`[^`]*`|<[^>]+>|https?:\/\/\S+/g;

const WORD = /[\p{L}\p{N}_]/u;

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The first plain-text occurrence of `phrase` as whole words (case-insensitive), or -1.
export function findMention(markdown: string, phrase: string): number {
  const skip: [number, number][] = [];
  for (const m of markdown.matchAll(SKIP)) skip.push([m.index, m.index + m[0].length]);
  const re = new RegExp(escape(phrase), "giu");
  for (const m of markdown.matchAll(re)) {
    const from = m.index;
    const to = from + m[0].length;
    if (skip.some(([a, b]) => from < b && to > a)) continue;
    const before = markdown[from - 1];
    const after = markdown[to];
    if ((before && WORD.test(before)) || (after && WORD.test(after))) continue;
    return from;
  }
  return -1;
}

function occurrences(text: string, part: string): number {
  let count = 0;
  for (let i = text.indexOf(part); i !== -1; i = text.indexOf(part, i + 1)) count++;
  return count;
}

// An edit that links the first plain mention of `title` (`[[Title]]`, or `[[Title|as written]]`
// when the case differs), with enough context that `oldStr` occurs exactly once.
export function mentionEdit(
  markdown: string,
  title: string,
): { oldStr: string; newStr: string } | null {
  const at = findMention(markdown, title);
  if (at === -1) return null;
  const end = at + title.length;
  const written = markdown.slice(at, end);
  const link = written === title ? `[[${title}]]` : `[[${title}|${written}]]`;
  let from = at;
  let to = end;
  while (occurrences(markdown, markdown.slice(from, to)) > 1) {
    if (from === 0 && to === markdown.length) return null;
    from = Math.max(0, from - 8);
    to = Math.min(markdown.length, to + 8);
  }
  return {
    oldStr: markdown.slice(from, to),
    newStr: markdown.slice(from, at) + link + markdown.slice(end, to),
  };
}
