// The context menu on a document in a list (the sidebar's tree, Home's "Jump back in"): the same
// items wherever it opens. The list carries out the built-in actions itself (rename is inline
// there); what plugins add (`documentMenu`) runs through `runDocumentMenuAction`.
import type { ContextMenuItem } from "@lydie/ui";

import { documentMenuLabel } from "./plugin.ts";
import type { AppApi, Contributed, DocumentRef } from "./plugin.ts";

export type DocumentMenuAction = "open-tab" | "open-split" | "new-child" | "rename" | "delete";

type Contribution = Contributed<"documentMenu">;

const PLUGIN_PREFIX = "plugin:";
const actionId = (m: Contribution) => `${PLUGIN_PREFIX}${m.pluginId}:${m.id}`;

export function documentMenuItems(
  doc: DocumentRef,
  contributions: readonly Contribution[],
): ContextMenuItem[] {
  return [
    { id: "open-tab", label: "Open in new tab" },
    { id: "open-split", label: "Open to the right" },
    { type: "separator", id: "s1" },
    { id: "new-child", label: "New document inside" },
    { id: "rename", label: "Rename" },
    ...contributions
      .filter((m) => !m.when || m.when(doc))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((m) => ({
        id: actionId(m),
        label: documentMenuLabel(m, doc),
        ...(m.danger ? { danger: true } : {}),
      })),
    { type: "separator", id: "s2" },
    { id: "delete", label: "Move to trash", danger: true },
  ];
}

// Runs a plugin's item and returns null, or returns the built-in action for the list to carry out.
export function runDocumentMenuAction(
  action: string,
  doc: DocumentRef,
  contributions: readonly Contribution[],
  app: AppApi,
): DocumentMenuAction | null {
  if (action.startsWith(PLUGIN_PREFIX)) {
    void contributions.find((m) => actionId(m) === action)?.run(doc, app);
    return null;
  }
  return action as DocumentMenuAction;
}
