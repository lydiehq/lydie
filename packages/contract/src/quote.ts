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

// Whitespace runs count as one space, so a quote copied across a line break still matches.
function squash(text: string): { text: string; at: number[] } {
  let out = "";
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!)) {
      if (!space) {
        out += " ";
        at.push(i);
      }
      space = true;
    } else {
      out += text[i];
      at.push(i);
      space = false;
    }
  }
  return { text: out, at };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
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
    const score =
      commonSuffix(hay.text.slice(0, i), prefix) + commonPrefix(hay.text.slice(last + 1), suffix);
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
