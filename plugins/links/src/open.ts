import { docPath } from "@lydie/plugin-api";
import type { AppApi, OpenOptions } from "@lydie/plugin-api";

import { clearResolveCache, resolveTarget } from "./resolve.ts";
import { isExternalHref, newNoteTitle } from "./targets.ts";

export type FollowTarget = { target: string; heading: string | null; blockId: string | null };

export function openExternal(href: string) {
  // App-internal schemes (a person mention) have nothing to open.
  if (href.startsWith("lydie:")) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

// Creates the note an unresolved link names, beside the linking note (where resolution looks
// first, so the link resolves to it).
export async function createNoteFor(app: AppApi, target: string, sourceId: string | null) {
  const source = sourceId
    ? (await app.backend.query("doc.get", { id: sourceId }))[0]?.document
    : undefined;
  const doc = await app.backend.ops.doc.create(
    {
      workspaceId: app.workspace.workspaceId,
      title: newNoteTitle(target),
      parentId: source?.parentId ?? null,
    },
    { scope: app.historyScope(), label: "Create linked note" },
  );
  clearResolveCache();
  return doc.id;
}

// Follows a link: resolves it (creating the note when it does not exist yet) and opens it. Links to
// a part of the same document scroll there when they open in place.
export async function follow(
  app: AppApi,
  link: FollowTarget,
  sourceId: string | null,
  mode: OpenOptions["mode"],
  scrollLocal?: (part: { heading: string | null; blockId: string | null }) => void,
) {
  if (isExternalHref(link.target)) return openExternal(link.target);
  let id = await resolveTarget(app.backend, link.target, sourceId);
  if (!id) id = await createNoteFor(app, link.target, sourceId);
  if (id === sourceId && (mode ?? "replace") === "replace" && scrollLocal) {
    scrollLocal({ heading: link.heading, blockId: link.blockId });
    return;
  }
  app.open(
    docPath(id, { heading: link.heading ?? undefined, blockId: link.blockId ?? undefined }),
    {
      mode,
    },
  );
}
