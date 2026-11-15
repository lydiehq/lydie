// Whether a view's path pattern covers a page's path. `:name` stands for one segment, a trailing
// `*` for the rest; the page's `#fragment` is not part of the match.
export function matchesPath(pattern: string, path: string): boolean {
  const want = pattern.split("/");
  const have = (path.split("#")[0] ?? "").split("/");
  const rest = want.at(-1) === "*";
  if (rest) want.pop();
  if (rest ? have.length < want.length : have.length !== want.length) return false;
  return want.every((part, i) => (part.startsWith(":") ? have[i] !== "" : part === have[i]));
}
