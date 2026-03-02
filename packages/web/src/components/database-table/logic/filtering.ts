export function applyPropertyFilters<T extends { properties: Record<string, unknown> }>(
  rows: T[],
  filters: Record<string, string | number | boolean> | undefined,
): T[] {
  if (!filters || Object.keys(filters).length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    Object.entries(filters).every(([field, expected]) => {
      const current = row.properties[field];
      if (Array.isArray(current)) {
        return current.some((entry) => String(entry) === String(expected));
      }
      return String(current ?? "") === String(expected);
    }),
  );
}
