// A readable, URL-safe form of a name or title: lowercase words joined by hyphens, accents
// dropped. Slugs are for people; an id is what identifies the thing.
export function slugify(text: string, fallback = "untitled"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || fallback;
}

// What a workspace's slug may be (`/w/<slug>` in the web app's URLs): one it was given, or one
// made from its name.
export const WORKSPACE_SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
