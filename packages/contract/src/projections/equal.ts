// Structural equality for JSON values (no node:util; the contract also runs in browsers).
export function isDeepStrictEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    isDeepStrictEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
