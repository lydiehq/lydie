// Title trigrams for the search fallback: when no document matches a query, titles that share
// enough trigrams with it are returned instead, so a typo still finds the page. The words and
// trigrams follow Postgres' pg_trgm (lower-cased words, two spaces before, one after), and the
// rules are kept simple enough for @lydie/store to build the same trigrams in SQLite triggers:
// only ASCII letters are lower-cased (SQLite's lower()) and words split on TRIGRAM_SEPARATORS.

// Characters that end a word, besides the space. @lydie/store replaces each with a space in SQL.
export const TRIGRAM_SEPARATORS = [
  "\t",
  "\n",
  "-",
  "_",
  ".",
  ",",
  ":",
  ";",
  "/",
  "\\",
  "|",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "'",
  '"',
  "!",
  "?",
  "&",
  "+",
  "#",
  "*",
  "=",
  "<",
  ">",
  "@",
] as const;

// Lowest share of the query's trigrams a title must contain to be returned by the fallback.
export const SIMILAR_TITLE = 0.5;

// The distinct trigrams of a text, as pg_trgm builds them: "Search" → "  s", " se", "sea", …, "ch ".
export function trigrams(text: string): string[] {
  let normal = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (const separator of TRIGRAM_SEPARATORS) normal = normal.replaceAll(separator, " ");
  const grams = new Set<string>();
  for (const word of normal.split(" ")) {
    if (!word) continue;
    // By code point, as SQLite's substr() counts.
    const padded = [" ", " ", ...word, " "];
    for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3).join(""));
  }
  return [...grams];
}

// A query's trigrams for the fallback; a long query is compared on its first 64.
export function queryTrigrams(query: string): string[] {
  return trigrams(query).slice(0, 64);
}

// The share of the query's trigrams that occur in the title (0 to 1).
export function titleSimilarity(query: readonly string[], title: string): number {
  if (query.length === 0) return 0;
  const own = new Set(trigrams(title));
  return query.filter((g) => own.has(g)).length / query.length;
}
