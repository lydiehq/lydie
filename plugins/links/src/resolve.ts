// Link target → document id. The source's saved links (`doc.links`) already carry the runtime's
// resolution; a link typed since the last save falls back to the same rule (Obsidian's): a title or
// a path of titles, case-insensitive; among several, the one in the source's folder, then the
// shortest path. Read through `backend.query` only when a link is hovered, followed or edited.
import { normalizeId } from "@lydie/plugin-api";
import type { Backend, LiveRow } from "@lydie/plugin-api";

import { linkKey } from "./targets.ts";

const TTL = 3000;
const cache = new Map<string, { at: number; id: string | null }>();

async function getDoc(backend: Backend, id: string) {
  const rows = await backend.query("doc.get", { id });
  const doc = rows[0]?.document;
  return doc && !doc.deletedAt ? doc : null;
}

// Folder keys from the top level down, e.g. ["projects", "lydie"].
async function folderOf(backend: Backend, parentId: string | null): Promise<string[]> {
  const out: string[] = [];
  for (let id = parentId; id && out.length < 32;) {
    const doc = await getDoc(backend, id);
    if (!doc) break;
    out.unshift(linkKey(doc.title));
    id = doc.parentId;
  }
  return out;
}

export async function resolveTarget(
  backend: Backend,
  target: string,
  sourceId: string | null,
): Promise<string | null> {
  const trimmed = target.trim();
  if (!trimmed) return sourceId;
  const cacheKey = `${sourceId ?? ""}\u0000${trimmed}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.id;
  const id = await resolveUncached(backend, trimmed, sourceId);
  cache.set(cacheKey, { at: Date.now(), id });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return id;
}

// Forget cached answers (after creating or renaming a document).
export function clearResolveCache() {
  cache.clear();
}

// A link target as the links table stores it, comparable with what the editor holds.
export function refKey(ref: string): string {
  return ref
    .replace(/\\/g, "/")
    .replace(/#.*$/, "")
    .replace(/\.(md|base)$/i, "")
    .trim()
    .normalize("NFC")
    .toLowerCase();
}

// The saved link with this target, if any: `{ id }` (resolved, or null when it resolves to nothing).
export function savedResolution(
  links: readonly LiveRow<"doc.links">[],
  target: string,
): { id: string | null } | null {
  const key = refKey(target);
  const link = links.find((l) => refKey(l.targetRef) === key);
  return link ? { id: link.target?.id ?? null } : null;
}

async function resolveUncached(
  backend: Backend,
  target: string,
  sourceId: string | null,
): Promise<string | null> {
  if (sourceId) {
    const saved = savedResolution(await backend.query("doc.links", { id: sourceId }), target);
    if (saved) return saved.id;
  }
  const id = normalizeId(target);
  if (id) {
    const doc = await getDoc(backend, id);
    if (doc) return doc.id;
  }
  const parts = target
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== ".");
  const name = parts.pop();
  if (!name) return null;
  const key = linkKey(name);
  const hits = await backend.query("doc.search", {
    workspaceId: backend.info.workspaceId,
    text: name.replace(/\.(md|base)$/i, ""),
    limit: 50,
  });
  const candidates = hits.filter((h) => linkKey(h.title) === key);
  if (candidates.length === 0) return null;
  if (candidates.length === 1 && parts.length === 0) return candidates[0]!.id;

  const dirKeys = parts.filter((p) => p !== "..").map(linkKey);
  const source = sourceId ? await getDoc(backend, sourceId) : null;
  const sourceFolder = source ? await folderOf(backend, source.parentId) : [];
  const scored: { id: string; folder: string[] }[] = [];
  for (const c of candidates) {
    const doc = await getDoc(backend, c.id);
    if (doc) scored.push({ id: c.id, folder: await folderOf(backend, doc.parentId) });
  }
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);
  const matching = scored.filter(
    (c) => dirKeys.length === 0 || same(c.folder.slice(-dirKeys.length), dirKeys),
  );
  if (matching.length === 0) return null;
  const local = matching.find((c) => same(c.folder, sourceFolder));
  if (local) return local.id;
  return matching.sort((a, b) => a.folder.length - b.folder.length)[0]!.id;
}

// The titles above a document, top first (for breadcrumbs).
export async function breadcrumbOf(backend: Backend, parentId: string | null): Promise<string[]> {
  const out: string[] = [];
  for (let id = parentId; id && out.length < 8;) {
    const doc = await getDoc(backend, id);
    if (!doc) break;
    out.unshift(doc.title);
    id = doc.parentId;
  }
  return out;
}
