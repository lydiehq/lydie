// What the top bar, the commands and the selection action share with the margin: each tab's
// editor, the comment being written, and whether resolved ones are shown. The margin (an editor
// overlay) publishes its editor per tab.
import type { ThreadAnchor } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";

// `anchor: null`: about the page as a whole. `seq` tells one draft from the next, so a new one
// starts with an empty field.
export type Draft = { anchor: ThreadAnchor | null; seq: number };

const editors = new Map<string, Editor>();
const drafts = new Map<string, Draft>();
const resolvedShown = new Set<string>();
const listeners = new Set<() => void>();
let seq = 0;

const emit = () => {
  for (const listener of [...listeners]) listener();
};

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setEditor(tabId: string, editor: Editor | null): void {
  if (editor) editors.set(tabId, editor);
  else editors.delete(tabId);
  emit();
}

export const editorOf = (tabId: string | null) => (tabId ? editors.get(tabId) : undefined);

export function setDraft(tabId: string, anchor: ThreadAnchor | null): void {
  drafts.set(tabId, { anchor, seq: ++seq });
  emit();
}

export function clearDraft(tabId: string): void {
  if (drafts.delete(tabId)) emit();
}

export const draftOf = (tabId: string | null) => (tabId ? drafts.get(tabId) : undefined);

export function setResolvedShown(tabId: string, shown: boolean): void {
  if (shown) resolvedShown.add(tabId);
  else resolvedShown.delete(tabId);
  emit();
}

export const resolvedShownIn = (tabId: string | null) => !!tabId && resolvedShown.has(tabId);

// Device setting: whether comments are shown, in the text and beside it.
export const SHOWN_KEY = "threads.shown";
