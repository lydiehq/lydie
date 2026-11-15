// How new links to documents are written in a folder window: the folder settings `linkFormat`
// (`[[Note]]` or `[Note](Note.md)`) and `linkPath` (Obsidian's "New link format"), read at the
// moment a link is made, so a change in Settings applies to the next link. Windows without folder
// settings (web, hosted) get null: callers keep writing the title as a wiki link.
import type { Backend } from "./backend.ts";
import type { AppApi } from "./plugin.ts";

export type LinkStyle = {
  format: "wiki" | "markdown";
  path: "shortest" | "relative" | "absolute";
};

export function linkStyleOf(app: Pick<AppApi, "services">): LinkStyle | null {
  const settings = app.services?.vault?.settings?.current();
  if (!settings) return null;
  return { format: settings.linkFormat, path: settings.linkPath };
}

const keyOf = (title: string) => title.trim().normalize("NFC").toLowerCase();

// Titles from the top of the tree down to `id` (folders are parent documents).
async function pathOf(backend: Backend, id: string): Promise<string[]> {
  const out: string[] = [];
  let next: string | null = id;
  for (let i = 0; next && i < 64; i++) {
    const rows: readonly { document: { title: string; parentId: string | null } }[] =
      await backend.query("doc.get", { id: next });
    const doc = rows[0]?.document;
    if (!doc) break;
    out.unshift(doc.title);
    next = doc.parentId;
  }
  return out;
}

// The target text for a link from `fromId` to `toId` (no `.md`):
// - absolute: the path from the folder's top, "Projects/Plan";
// - relative: from the linking note's folder, "../Projects/Plan";
// - shortest: the name when no other note has it, else the absolute path.
export async function linkTargetFor(
  backend: Backend,
  fromId: string | null,
  toId: string,
  path: LinkStyle["path"],
): Promise<string> {
  const target = await pathOf(backend, toId);
  const title = target.at(-1) ?? "";
  if (path === "shortest") {
    const hits = await backend.query("doc.search", {
      workspaceId: backend.info.workspaceId,
      text: title,
      limit: 50,
    });
    const same = hits.filter((h) => keyOf(h.title) === keyOf(title)).length;
    return same <= 1 ? title : target.join("/");
  }
  if (path === "absolute" || !fromId) return target.join("/");
  const from = (await pathOf(backend, fromId)).slice(0, -1);
  const folder = target.slice(0, -1);
  let common = 0;
  while (common < from.length && common < folder.length && from[common] === folder[common]) {
    common++;
  }
  return [...from.slice(common).map(() => ".."), ...target.slice(common)].join("/");
}

// The Markdown-link destination Obsidian writes for a target: `../My%20note.md` (balanced
// parentheses are valid in a destination; `#` and `?` would start a fragment or query).
export function markdownHref(target: string): string {
  return `${encodeURI(target).replace(/[#?]/g, (c) => encodeURIComponent(c))}.md`;
}
