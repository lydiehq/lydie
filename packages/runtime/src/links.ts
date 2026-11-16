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
  return (await resolveLinks(tx, source, [link]))[0] ?? null;
}

// Whether a link resolves relative to its source's folder (Markdown `./x`, `../x`).
export function isRelativeLink(link: Pick<ExtractedLink, "target" | "syntax">): boolean {
  return link.syntax === "markdown" && /^\.\.?\//.test(link.target);
}

// resolveLink for every link of a document at once: the ids and the title keys are each looked
// up in one round trip where the port allows it, each distinct key once.
export async function resolveLinks(
  tx: DbRead,
  source: Document,
  links: readonly Pick<ExtractedLink, "target" | "syntax">[],
): Promise<(string | null)[]> {
  if (links.length === 0) return [];
  const ids = links.map((l) => normalizeId(l.target));
  const byId = await getDocs(
    tx,
    ids.filter((id) => id !== null),
  );
  type Parsed =
    | { resolved: string | null }
    | { link: (typeof links)[number]; parts: string[]; key: string };
  const parsed = links.map((link, i): Parsed => {
    const id = ids[i];
    const found = id ? byId.get(id) : undefined;
    if (found && found.workspaceId === source.workspaceId && !found.deletedAt) {
      return { resolved: found.id };
    }
    const parts = segments(link.target);
    const name = parts.pop();
    return name ? { link, parts, key: targetKey(name) } : { resolved: null };
  });
  const keys = [...new Set(parsed.flatMap((p) => ("key" in p ? [p.key] : [])))];
  const candidatesOf = await findByKeys(tx, source.workspaceId, keys);
  const folderOf = folderCache(tx);
  const out: (string | null)[] = [];
  for (const p of parsed) {
    if ("resolved" in p) out.push(p.resolved);
    else out.push(await pick(folderOf, source, p.link, p.parts, candidatesOf.get(p.key) ?? []));
  }
  return out;
}

async function getDocs(tx: DbRead, ids: readonly string[]): Promise<Map<string, Document>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const docs = tx.docs.getMany
    ? await tx.docs.getMany(unique)
    : await Promise.all(unique.map((id) => tx.docs.get(id)));
  return new Map(docs.filter((d) => d !== null).map((d) => [d.id, d]));
}

async function findByKeys(
  tx: DbRead,
  workspaceId: string,
  keys: readonly string[],
): Promise<Map<string, Document[]>> {
  if (keys.length === 0) return new Map();
  if (tx.docs.findAllByLinkKeys && keys.length > 1) {
    return tx.docs.findAllByLinkKeys(workspaceId, keys);
  }
  const out = new Map<string, Document[]>();
  for (const key of keys) {
    out.set(
      key,
      tx.docs.findAllByLinkKey
        ? await tx.docs.findAllByLinkKey(workspaceId, key)
        : [await tx.docs.findByLinkKey(workspaceId, key)].filter((d) => d !== null),
    );
  }
  return out;
}

// Folder keys by document, for one resolution pass (documents under one folder share a lookup).
function folderCache(tx: DbRead) {
  const byParent = new Map<string | null, Promise<string[]>>();
  return (doc: Document): Promise<string[]> => {
    let keys = byParent.get(doc.parentId);
    if (!keys) {
      keys = folderKeys(tx, doc);
      byParent.set(doc.parentId, keys);
    }
    return keys;
  };
}

async function pick(
  folderOf: (doc: Document) => Promise<string[]>,
  source: Document,
  link: Pick<ExtractedLink, "target" | "syntax">,
  parts: string[],
  candidates: readonly Document[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1 && parts.length === 0) return candidates[0]!.id;

  const sourceFolder = await folderOf(source);
  let wanted: string[] | null = null;
  if (isRelativeLink(link)) {
    wanted = [...sourceFolder];
    for (const part of parts) {
      if (part === "..") wanted.pop();
      else wanted.push(linkKey(part));
    }
  }
  const dirKeys = parts.filter((p) => p !== "..").map(linkKey);
  const scored: { doc: Document; folder: string[] }[] = [];
  for (const doc of candidates) scored.push({ doc, folder: await folderOf(doc) });

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
