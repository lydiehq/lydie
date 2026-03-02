export type SortValue = string | number | boolean | string[] | null | undefined;

export function sortNullableValues(
  first: SortValue,
  second: SortValue,
): number {
  if (first == null && second == null) {
    return 0;
  }
  if (first == null) {
    return 1;
  }
  if (second == null) {
    return -1;
  }

  if (typeof first === "number" && typeof second === "number") {
    return first - second;
  }

  if (typeof first === "boolean" && typeof second === "boolean") {
    return Number(first) - Number(second);
  }

  if (Array.isArray(first) && Array.isArray(second)) {
    return first.join(",").localeCompare(second.join(","), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  return String(first).localeCompare(String(second), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
