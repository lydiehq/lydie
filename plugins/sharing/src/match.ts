// Matching for the Share dialog's suggestions: case-insensitive, and each word typed must start
// some word of the name or the email ("sam", "sam jo" and "jones" all find Sam Jones; "am" does
// not). The whole email counts as a word too, so a full address typed still finds its owner.

function words(text: string): string[] {
  const lower = text.toLowerCase();
  return [lower, ...lower.split(/[^\p{L}\p{N}]+/u)].filter(Boolean);
}

export function matchesWords(query: string, ...texts: (string | null | undefined)[]): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  const candidates = texts.flatMap((t) => (t ? words(t) : []));
  return terms.every((term) => candidates.some((w) => w.startsWith(term)));
}

export type Person = { userId: string; name: string | null; email: string | null };

// Members to suggest for `query`: matching ones not excluded (the signed-in user, those granted
// on the page already), names starting with the query first, then by name.
export function suggestPeople<T extends Person>(
  people: readonly T[],
  query: string,
  exclude: ReadonlySet<string>,
): T[] {
  const first = query.trim().toLowerCase();
  const label = (p: T) => (p.name || p.email || "").toLowerCase();
  return people
    .filter((p) => !exclude.has(p.userId) && matchesWords(query, p.name, p.email))
    .sort(
      (a, b) =>
        Number(!label(a).startsWith(first)) - Number(!label(b).startsWith(first)) ||
        label(a).localeCompare(label(b)),
    );
}
