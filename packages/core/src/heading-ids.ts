export function toHeadingSlug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "section";
}

export function createHeadingIdGenerator(): (text: string) => string {
  const seenCounts = new Map<string, number>();

  return (text: string) => {
    const baseSlug = toHeadingSlug(text);
    const nextCount = (seenCounts.get(baseSlug) || 0) + 1;
    seenCounts.set(baseSlug, nextCount);

    return nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
  };
}
