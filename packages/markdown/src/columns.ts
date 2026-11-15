// What a column's `width` means, for everything that draws a row: the editor and the page
// renderers outside it.

// Every column's share of the row in percent. A column without a width takes an equal part of
// what the others leave.
export function columnShares(widths: readonly (number | null)[]): number[] {
  const set = widths.filter((w): w is number => typeof w === "number" && w > 0);
  const unset = widths.length - set.length;
  const used = set.reduce((sum, w) => sum + w, 0);
  const rest = unset ? (used < 100 ? (100 - used) / unset : used / set.length) : 0;
  return widths.map((w) => (typeof w === "number" && w > 0 ? w : rest || 100 / widths.length));
}
