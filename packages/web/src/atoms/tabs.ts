import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface DocumentTab {
  documentId: string;
  title: string;
  isDirty?: boolean;
  isPreview?: boolean;
}

const STORAGE_KEY = "lydie-document-tabs";
const MAX_TABS = 10;

// Storage-backed atoms
const storedTabsAtom = atomWithStorage<DocumentTab[]>(STORAGE_KEY, []);
const storedActiveTabIdAtom = atomWithStorage<string | null>(
  `${STORAGE_KEY}-active`,
  null,
);

// Read-only derived atoms
export const documentTabsAtom = atom((get) => get(storedTabsAtom));
export const activeTabIdAtom = atom((get) => get(storedActiveTabIdAtom));

// Helper to find tab index
const findTabIndex = (tabs: DocumentTab[], documentId: string) =>
  tabs.findIndex((t) => t.documentId === documentId);

// Action: Open or activate a tab
export const openDocumentTabAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    const currentTabs = _get(storedTabsAtom);
    const existingIndex = findTabIndex(currentTabs, documentId);

    let newTabs: DocumentTab[];

    if (existingIndex !== -1) {
      // Tab exists - activate it and commit from preview if needed
      newTabs = currentTabs.map((tab, i) =>
        i === existingIndex ? { ...tab, isPreview: false } : tab,
      );
    } else {
      // Add new tab, respecting max limit
      newTabs = [...currentTabs, { documentId, title, isPreview: false }];
      if (newTabs.length > MAX_TABS) {
        // Remove oldest non-preview, or oldest if all are previews
        const oldestNonPreviewIndex = newTabs.findIndex((t) => !t.isPreview);
        const removeIndex =
          oldestNonPreviewIndex !== -1
            ? oldestNonPreviewIndex
            : 0;
        newTabs = newTabs.filter((_, i) => i !== removeIndex);
      }
    }

    set(storedTabsAtom, newTabs);
    set(storedActiveTabIdAtom, documentId);
  },
);

// Action: Close a tab and return next active ID
export const closeDocumentTabAtom = atom(
  null,
  (_get, set, documentId: string): string | null => {
    const currentTabs = _get(storedTabsAtom);
    const currentActiveId = _get(storedActiveTabIdAtom);
    const index = findTabIndex(currentTabs, documentId);

    if (index === -1) return currentActiveId;

    const wasActive = currentTabs[index].documentId === currentActiveId;
    const newTabs = currentTabs.filter((t) => t.documentId !== documentId);

    let nextActiveId = currentActiveId;
    if (wasActive) {
      nextActiveId =
        newTabs[index - 1]?.documentId ?? newTabs[0]?.documentId ?? null;
      set(storedActiveTabIdAtom, nextActiveId);
    }

    set(storedTabsAtom, newTabs);
    return nextActiveId;
  },
);

// Action: Activate a tab
export const activateDocumentTabAtom = atom(
  null,
  (_get, set, documentId: string) => {
    const currentTabs = _get(storedTabsAtom);
    if (findTabIndex(currentTabs, documentId) !== -1) {
      set(storedActiveTabIdAtom, documentId);
    }
  },
);

// Action: Mark tab dirty state
export const markTabDirtyAtom = atom(
  null,
  (_get, set, { documentId, isDirty }: { documentId: string; isDirty: boolean }) => {
    const currentTabs = _get(storedTabsAtom);
    const newTabs = currentTabs.map((tab) =>
      tab.documentId === documentId ? { ...tab, isDirty } : tab,
    );
    set(storedTabsAtom, newTabs);
  },
);

// Action: Update tab title
export const updateTabTitleAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    const currentTabs = _get(storedTabsAtom);
    const newTabs = currentTabs.map((tab) =>
      tab.documentId === documentId ? { ...tab, title } : tab,
    );
    set(storedTabsAtom, newTabs);
  },
);

// Action: Replace preview tab (for single-click navigation)
export const replacePreviewTabAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    const currentTabs = _get(storedTabsAtom);
    const previewIndex = currentTabs.findIndex((t) => t.isPreview);

    let newTabs: DocumentTab[];
    if (previewIndex !== -1) {
      // Replace existing preview
      newTabs = currentTabs.map((tab, i) =>
        i === previewIndex ? { documentId, title, isPreview: true } : tab,
      );
    } else {
      // Add new preview tab
      newTabs = [...currentTabs, { documentId, title, isPreview: true }];
      if (newTabs.length > MAX_TABS) {
        const oldestNonPreviewIndex = newTabs.findIndex((t) => !t.isPreview);
        const removeIndex =
          oldestNonPreviewIndex !== -1 ? oldestNonPreviewIndex : 0;
        newTabs = newTabs.filter((_, i) => i !== removeIndex);
      }
    }

    set(storedTabsAtom, newTabs);
    set(storedActiveTabIdAtom, documentId);
  },
);

// Combined action for syncing document on mount/title change
export const syncDocumentTabAtom = atom(
  null,
  (
    _get,
    set,
    {
      documentId,
      title,
      mode = "open",
    }: { documentId: string; title: string; mode?: "open" | "preview" },
  ) => {
    const currentTabs = _get(storedTabsAtom);
    const existingIndex = findTabIndex(currentTabs, documentId);

    if (existingIndex !== -1) {
      // Tab exists - update title and activate
      const newTabs = currentTabs.map((tab, i) =>
        i === existingIndex ? { ...tab, title, isPreview: false } : tab,
      );
      set(storedTabsAtom, newTabs);
      set(storedActiveTabIdAtom, documentId);
    } else if (mode === "preview") {
      // Add as preview tab
      set(replacePreviewTabAtom, { documentId, title });
    } else {
      // Open as regular tab
      set(openDocumentTabAtom, { documentId, title });
    }
  },
);
