// Finding a quoted passage again: how a thread stays attached to its text. An anchor is the
// quote itself plus a little text on either side (the W3C TextQuoteSelector shape), never an
// offset, so it survives edits made anywhere else and needs nothing written into the document.
// These work on plain strings: the text of a document as a reader sees it.

export type QuoteSelector = {
  quote: string;
  // Text just before and after the quote, to tell repeats apart.
  prefix?: string | undefined;
  suffix?: string | undefined;
};

export type QuoteRange = { start: number; end: number };

// How much surrounding text an anchor keeps.
export const QUOTE_CONTEXT = 32;

// Whitespace runs count as one space, so a quote copied across a line break still matches. `at`
// is where each character of the squashed text is in the original.
function squash(text: string): { text: string; at: number[] } {
  const at: number[] = [];
  let last = 0;
  for (const run of text.matchAll(/\s+/g)) {
    for (let i = last; i < run.index; i++) at.push(i);
    at.push(run.index);
    last = run.index + run[0].length;
  }
  for (let i = last; i < text.length; i++) at.push(i);
  return { text: text.replace(/\s+/g, " "), at };
}

// How many characters before `end` in `text` match the end of `prefix`, and how many from
// `start` match the start of `suffix`: by index, as slicing the text per repeat is quadratic.
function matchBefore(text: string, end: number, prefix: string): number {
  let n = 0;
  while (n < end && n < prefix.length && text[end - 1 - n] === prefix[prefix.length - 1 - n]) n++;
  return n;
}

function matchAfter(text: string, start: number, suffix: string): number {
  let n = 0;
  while (start + n < text.length && n < suffix.length && text[start + n] === suffix[n]) n++;
  return n;
}

// The range of a quote in a plain string, or null when it is not there. With repeats, the one
// whose surroundings match `prefix` and `suffix` best; the first when nothing tells them apart.
export function findQuote(text: string, selector: QuoteSelector): QuoteRange | null {
  const hay = squash(text);
  const needle = squash(selector.quote).text.trim();
  if (!needle) return null;
  const prefix = squash(selector.prefix ?? "").text;
  const suffix = squash(selector.suffix ?? "").text;
  let top: (QuoteRange & { score: number }) | null = null;
  for (let i = hay.text.indexOf(needle); i !== -1; i = hay.text.indexOf(needle, i + 1)) {
    const last = i + needle.length - 1;
    const score = matchBefore(hay.text, i, prefix) + matchAfter(hay.text, last + 1, suffix);
    if (!top || score > top.score) top = { start: hay.at[i]!, end: hay.at[last]! + 1, score };
  }
  return top ? { start: top.start, end: top.end } : null;
}

// The anchor to store for a range of a plain string.
export function describeQuote(text: string, range: QuoteRange): Required<QuoteSelector> {
  return {
    quote: text.slice(range.start, range.end),
    prefix: text.slice(Math.max(0, range.start - QUOTE_CONTEXT), range.start),
    suffix: text.slice(range.end, range.end + QUOTE_CONTEXT),
  };
}
