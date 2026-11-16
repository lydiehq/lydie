import type { Attachment } from "@lydie/contract";

import { useQuerySelect, useWorkspace } from "./react.tsx";

// The workspace's attachments by lowercased file name (the first of a name wins), built once per
// `attachment.list` result and shared, so a page with many images or covers looks each up rather
// than scanning the list once per image.
const byName = new WeakMap<readonly Attachment[], ReadonlyMap<string, Attachment>>();

function attachmentsByName(list: readonly Attachment[]): ReadonlyMap<string, Attachment> {
  let map = byName.get(list);
  if (!map) {
    const names = new Map<string, Attachment>();
    for (const attachment of list) {
      const name = attachment.filename.toLowerCase();
      if (!names.has(name)) names.set(name, attachment);
    }
    byName.set(list, (map = names));
  }
  return map;
}

const LOADING = Symbol("loading");

// The attachment a file name (or a path ending in one) refers to, matched case-insensitively.
// Renders only when that attachment changes, not on every upload. `filename` null: none asked.
export function useAttachmentNamed(filename: string | null): {
  attachment: Attachment | null;
  isLoading: boolean;
} {
  const workspace = useWorkspace();
  const name = filename ? filename.split("/").pop()!.toLowerCase() : null;
  const found = useQuerySelect(
    "attachment.list",
    name ? { workspaceId: workspace.workspaceId } : null,
    (state) =>
      state.isLoading ? LOADING : name ? (attachmentsByName(state.data).get(name) ?? null) : null,
  );
  return found === LOADING
    ? { attachment: null, isLoading: true }
    : { attachment: found, isLoading: false };
}
