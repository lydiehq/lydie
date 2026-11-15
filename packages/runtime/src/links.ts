import { normalizeId } from "@lydie/contract";
import type { Document } from "@lydie/contract";

import type { DbRead } from "./ports.ts";
import { linkKey } from "./text.ts";
import type { ExtractedLink } from "./text.ts";

// Link resolution, following Obsidian (help.obsidian.md/links): a target is a title or a path of
// titles ("Folder/Note"), matched case-insensitively, `.md` optional. When several documents
// match, prefer one in the source's own folder, then the shortest path, then tree order. Markdown
// links starting with ./ or ../ are relative to the source. An id resolves by id (in the older ULID spelling too). Folders are
// parent documents, so a document's path is its ancestors' titles.

async function ancestorsOf(tx: DbRead, doc: Document): Promise<Document[]> {
  if (tx.docs.ancestors) return tx.docs.ancestors(doc.id);
  const out: Document[] = [];
  for (let id = doc.parentId; id;) {
    const parent = await tx.docs.get(id);
    if (!parent) break;
    out.push(parent);
    id = parent.parentId;
  }
  return out;
}

// Path keys from the top level down, e.g. ["projects", "lydie"] for Projects/Lydie/<doc>.
async function folderKeys(tx: DbRead, doc: Document): Promise<string[]> {
  return (await ancestorsOf(tx, doc)).map((d) => linkKey(d.title)).reverse();
}

// The title key a link target points at. `X.base` (an embedded database, as in Obsidian's
// `![[Tasks.base#View]]`) points at the database document titled X.
export function targetKey(target: string): string {
  return linkKey(target.replace(/\.base$/i, ""));
}

function segments(target: string): string[] {
  return target
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== ".");
}

export async function resolveLink(
  tx: DbRead,
  source: Document,
  link: Pick<ExtractedLink, "target" | "syntax">,
): Promise<string | null> {
  const id = normalizeId(link.target);
  if (id) {
    const byId = await tx.docs.get(id);
    if (byId && byId.workspaceId === source.workspaceId && !byId.deletedAt) return byId.id;
  }
  const relative = link.syntax === "markdown" && /^\.\.?\//.test(link.target);
  const parts = segments(link.target);
  const name = parts.pop();
  if (!name) return null;
  const key = targetKey(name);
  const candidates = tx.docs.findAllByLinkKey
    ? await tx.docs.findAllByLinkKey(source.workspaceId, key)
    : [await tx.docs.findByLinkKey(source.workspaceId, key)].filter((d) => d !== null);
  if (candidates.length === 0) return null;
  if (candidates.length === 1 && parts.length === 0) return candidates[0]!.id;

  const sourceFolder = await folderKeys(tx, source);
  let wanted: string[] | null = null;
  if (relative) {
    wanted = [...sourceFolder];
    for (const part of parts) {
      if (part === "..") wanted.pop();
      else wanted.push(linkKey(part));
    }
  }
  const dirKeys = parts.filter((p) => p !== "..").map(linkKey);
  const scored: { doc: Document; folder: string[] }[] = [];
  for (const doc of candidates) scored.push({ doc, folder: await folderKeys(tx, doc) });

  const same = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);
  if (wanted) {
    const exact = scored.find((c) => same(c.folder, wanted));
    if (exact) return exact.doc.id;
  }
  const matching = scored.filter(
    (c) => dirKeys.length === 0 || same(c.folder.slice(-dirKeys.length), dirKeys),
  );
  if (matching.length === 0) return null;
  const inSourceFolder = matching.find((c) => same(c.folder, sourceFolder));
  if (inSourceFolder) return inSourceFolder.doc.id;
  // Candidates arrive in tree order, and sort is stable, so ties keep it.
  return matching.sort((a, b) => a.folder.length - b.folder.length)[0]!.doc.id;
}
