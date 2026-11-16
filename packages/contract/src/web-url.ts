import { slugify } from "./slug.ts";

// A document's address in the web app, below its base: `d/<title>-<id as 32 hex digits>`, the
// title for people to read (Notion's way). Only the id counts, so without a title it is `d/<id>`.
export function docUrlSegment(id: string, title?: string | null): string {
  return title?.trim()
    ? `d/${slugify(title)}-${id.replaceAll("-", "")}`
    : `d/${encodeURIComponent(id)}`;
}

// The link to a hosted document that anyone with access can open: `<webUrl>/w/<workspace>/d/…`.
// `workspace` is the workspace's slug, or its id where the slug is not known.
export function webDocUrl(
  webUrl: string,
  workspace: string,
  doc: { id: string; title?: string | null },
): string {
  const base = webUrl.endsWith("/") ? webUrl : `${webUrl}/`;
  return `${base}w/${encodeURIComponent(workspace)}/${docUrlSegment(doc.id, doc.title)}`;
}
