// Documents by path: "Meta/Templates" is the document titled "Templates" inside the top-level
// "Meta" (titles compared without case), the way a folder's settings name folders.
import type { ChildEntry } from "@lydie/contract";

import type { TransactionOps } from "./backend.ts";
import type { AppApi } from "./plugin.ts";

export function pathSegments(path: string): string[] {
  return path
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== ".");
}

// The deepest document of the path that exists (null = the top level) and the titles below it
// that do not exist yet. An empty path is the top level.
export type PathMatch = { id: string | null; missing: string[] };

export async function resolvePath(
  app: Pick<AppApi, "backend" | "workspace">,
  path: string,
): Promise<PathMatch> {
  const segments = pathSegments(path);
  let id: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const title = segments[i]!.toLowerCase();
    const children: readonly ChildEntry[] = await app.backend.query("doc.children", {
      workspaceId: app.workspace.workspaceId,
      parentId: id,
    });
    const found = children.find((d) => d.title.trim().toLowerCase() === title);
    if (!found) return { id, missing: segments.slice(i) };
    id = found.id;
  }
  return { id, missing: [] };
}

// The document at the path, or null when some part of it does not exist.
export async function findByPath(
  app: Pick<AppApi, "backend" | "workspace">,
  path: string,
): Promise<string | null> {
  const match = await resolvePath(app, path);
  return match.missing.length ? null : match.id;
}

// Creates what `resolvePath` found missing (inside a transaction); returns the path's document.
export async function createMissing(
  ops: TransactionOps,
  workspaceId: string,
  match: PathMatch,
): Promise<string | null> {
  let id = match.id;
  for (const title of match.missing) {
    id = (await ops.doc.create({ workspaceId, title, parentId: id })).id;
  }
  return id;
}
