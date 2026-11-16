// Titles being typed in a doc view whose rename is not written yet (it waits for a pause): the
// tab and the breadcrumbs show them meanwhile. One per document.
import { useSyncExternalStore } from "react";

const drafts = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

// null: no draft (the stored title shows).
export function setTitleDraft(id: string, title: string | null) {
  if (title === null ? !drafts.has(id) : drafts.get(id) === title) return;
  if (title === null) drafts.delete(id);
  else drafts.set(id, title);
  notify();
}

// Drops the draft once its rename has landed, unless typing has moved it on since.
export function clearTitleDraft(id: string, title: string) {
  if (drafts.get(id) === title) setTitleDraft(id, null);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useTitleDraft(id: string | null): string | null {
  return useSyncExternalStore(subscribe, () => (id ? (drafts.get(id) ?? null) : null));
}
