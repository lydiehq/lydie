import { atom } from "jotai";

export type TabMode = "preview" | "persistent";

export interface DocumentTab {
  documentId: string;
  title: string;
  isDirty?: boolean;
  mode?: TabMode;
}

const STORAGE_KEY = "lydie:document:tabs";
const MAX_TABS = 10;

type TabStorageScope = {
  userId: string | null;
  workspaceId: string | null;
};

type TabStorageState = {
  tabs: DocumentTab[];
  activeTabId: string | null;
};

const DEFAULT_TAB_STORAGE_STATE: TabStorageState = {
  tabs: [],
  activeTabId: null,
};

const tabStorageScopeAtom = atom<TabStorageScope>({
  userId: null,
  workspaceId: null,
});

const storedTabStateAtom = atom<TabStorageState>(DEFAULT_TAB_STORAGE_STATE);

function getScopedStorageKey(baseKey: string, scope: TabStorageScope): string {
  const userScope = scope.userId ? `:user:${scope.userId}` : "";
  const workspaceScope = scope.workspaceId ? `:workspace:${scope.workspaceId}` : "";
  return `${baseKey}${userScope}${workspaceScope}`;
}

function readStorageValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage errors
  }
}

function loadTabStorageState(scope: TabStorageScope): TabStorageState {
  if (!scope.userId || !scope.workspaceId) {
    return DEFAULT_TAB_STORAGE_STATE;
  }

  try {
    const tabsKey = getScopedStorageKey(STORAGE_KEY, scope);
    const activeTabKey = getScopedStorageKey(`${STORAGE_KEY}-active`, scope);

    const tabsValue = readStorageValue(tabsKey);
    const activeTabValue = readStorageValue(activeTabKey);

    const tabs = tabsValue ? (JSON.parse(tabsValue) as DocumentTab[]) : [];
    const activeTabId = activeTabValue ? (JSON.parse(activeTabValue) as string | null) : null;

    return {
      tabs: Array.isArray(tabs) ? tabs : [],
      activeTabId: typeof activeTabId === "string" || activeTabId === null ? activeTabId : null,
    };
  } catch {
    return DEFAULT_TAB_STORAGE_STATE;
  }
}

function persistTabStorageState(scope: TabStorageScope, state: TabStorageState): void {
  if (!scope.userId || !scope.workspaceId) {
    return;
  }

  const tabsKey = getScopedStorageKey(STORAGE_KEY, scope);
  const activeTabKey = getScopedStorageKey(`${STORAGE_KEY}-active`, scope);

  writeStorageValue(tabsKey, JSON.stringify(state.tabs));
  writeStorageValue(activeTabKey, JSON.stringify(state.activeTabId));
}

export const setDocumentTabsStorageScopeAtom = atom(
  null,
  (get, set, scope: TabStorageScope) => {
    const currentScope = get(tabStorageScopeAtom);
    const isSameScope =
      currentScope.userId === scope.userId && currentScope.workspaceId === scope.workspaceId;

    if (isSameScope) {
      return;
    }

    set(tabStorageScopeAtom, scope);
    set(storedTabStateAtom, loadTabStorageState(scope));
  },
);

const storedTabsAtom = atom(
  (get) => get(storedTabStateAtom).tabs,
  (get, set, tabs: DocumentTab[]) => {
    const currentState = get(storedTabStateAtom);
    const nextState = {
      ...currentState,
      tabs,
    };

    set(storedTabStateAtom, nextState);
    persistTabStorageState(get(tabStorageScopeAtom), nextState);
  },
);

const storedActiveTabIdAtom = atom(
  (get) => get(storedTabStateAtom).activeTabId,
  (get, set, activeTabId: string | null) => {
    const currentState = get(storedTabStateAtom);
    const nextState = {
      ...currentState,
      activeTabId,
    };

    set(storedTabStateAtom, nextState);
    persistTabStorageState(get(tabStorageScopeAtom), nextState);
  },
);

// Read-only derived atoms
export const documentTabsAtom = atom((get) => {
  const tabs = get(storedTabsAtom);
  // Sort tabs: persistent tabs first, then preview tabs at the end
  return [...tabs].sort((a, b) => {
    const aIsPreview = a.mode === "preview";
    const bIsPreview = b.mode === "preview";
    if (aIsPreview === bIsPreview) return 0;
    return aIsPreview ? 1 : -1;
  });
});
export const activeTabIdAtom = atom((get) => get(storedActiveTabIdAtom));

// Helper to find tab index
const findTabIndex = (tabs: DocumentTab[], documentId: string) =>
  tabs.findIndex((t) => t.documentId === documentId);

// Helper to check if tab is persistent
const isPersistent = (tab: DocumentTab) => tab.mode === "persistent";

// Action: Open or activate a persistent tab
export const openPersistentTabAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    const currentTabs = _get(storedTabsAtom);
    const existingIndex = findTabIndex(currentTabs, documentId);

    let newTabs: DocumentTab[];

    if (existingIndex !== -1) {
      // Tab exists - activate it and make it persistent if it was preview
      newTabs = currentTabs.map((tab, i) =>
        i === existingIndex ? { ...tab, mode: "persistent" as const } : tab,
      );
    } else {
      // Add new persistent tab, respecting max limit
      newTabs = [...currentTabs, { documentId, title, mode: "persistent" as const }];
      if (newTabs.length > MAX_TABS) {
        // Remove oldest preview tab, or oldest persistent if no previews
        const oldestPreviewIndex = newTabs.findIndex((t) => t.mode === "preview");
        const removeIndex = oldestPreviewIndex !== -1 ? oldestPreviewIndex : 0;
        newTabs = newTabs.filter((_, i) => i !== removeIndex);
      }
    }

    set(storedTabsAtom, newTabs);
    set(storedActiveTabIdAtom, documentId);
  },
);

// Action: Open a preview tab (replaces existing preview)
export const openPreviewTabAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    const currentTabs = _get(storedTabsAtom);
    const existingIndex = findTabIndex(currentTabs, documentId);

    // If document already exists (as any type of tab), just activate it
    if (existingIndex !== -1) {
      set(storedActiveTabIdAtom, documentId);
      return;
    }

    const previewIndex = currentTabs.findIndex((t) => t.mode === "preview");

    let newTabs: DocumentTab[];
    if (previewIndex !== -1) {
      // Replace existing preview
      newTabs = currentTabs.map((tab, i) =>
        i === previewIndex ? { documentId, title, mode: "preview" as const } : tab,
      );
    } else {
      // Add new preview tab
      newTabs = [...currentTabs, { documentId, title, mode: "preview" as const }];
      if (newTabs.length > MAX_TABS) {
        // Remove oldest persistent tab if at limit (previews get replaced anyway)
        const oldestPersistentIndex = newTabs.findIndex(isPersistent);
        const removeIndex = oldestPersistentIndex !== -1 ? oldestPersistentIndex : 0;
        newTabs = newTabs.filter((_, i) => i !== removeIndex);
      }
    }

    set(storedTabsAtom, newTabs);
    set(storedActiveTabIdAtom, documentId);
  },
);

// Action: Convert a preview tab to persistent
export const makeTabPersistentAtom = atom(null, (_get, set, documentId: string) => {
  const currentTabs = _get(storedTabsAtom);
  const index = findTabIndex(currentTabs, documentId);

  if (index === -1) return;

  const tab = currentTabs[index];
  if (tab.mode !== "preview") return;

  const newTabs = currentTabs.map((t, i) =>
    i === index ? { ...t, mode: "persistent" as const } : t,
  );
  set(storedTabsAtom, newTabs);
});

// Action: Close a tab and return next active ID
export const closeDocumentTabAtom = atom(null, (_get, set, documentId: string): string | null => {
  const currentTabs = _get(storedTabsAtom);
  const currentActiveId = _get(storedActiveTabIdAtom);
  const index = findTabIndex(currentTabs, documentId);

  if (index === -1) return currentActiveId;

  const wasActive = currentTabs[index].documentId === currentActiveId;
  const newTabs = currentTabs.filter((t) => t.documentId !== documentId);

  let nextActiveId = currentActiveId;
  if (wasActive) {
    nextActiveId = newTabs[index - 1]?.documentId ?? newTabs[0]?.documentId ?? null;
    set(storedActiveTabIdAtom, nextActiveId);
  }

  set(storedTabsAtom, newTabs);

  // Clean up the editor cache for this document
  // Import dynamically to avoid circular dependency
  import("@/lib/editor/editor-cache").then(({ editorCache }) => {
    editorCache.remove(documentId);
  });

  return nextActiveId;
});

// Action: Activate a tab
export const activateDocumentTabAtom = atom(null, (_get, set, documentId: string) => {
  const currentTabs = _get(storedTabsAtom);
  if (findTabIndex(currentTabs, documentId) !== -1) {
    set(storedActiveTabIdAtom, documentId);
  }
});

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

// Combined action for syncing document on mount/title change
export const syncDocumentTabAtom = atom(
  null,
  (
    _get,
    set,
    {
      documentId,
      title,
      mode = "persistent",
    }: { documentId: string; title: string; mode?: TabMode },
  ) => {
    const currentTabs = _get(storedTabsAtom);
    const existingIndex = findTabIndex(currentTabs, documentId);

    if (existingIndex !== -1) {
      // Tab exists - update title and activate (keep existing mode)
      const newTabs = currentTabs.map((tab, i) => (i === existingIndex ? { ...tab, title } : tab));
      set(storedTabsAtom, newTabs);
      set(storedActiveTabIdAtom, documentId);
    } else if (mode === "preview") {
      // Add as preview tab
      set(openPreviewTabAtom, { documentId, title });
    } else {
      // Open as persistent tab
      set(openPersistentTabAtom, { documentId, title });
    }
  },
);

// Action: Open document in background tab (cmd+click)
// Opens as persistent but doesn't activate or navigate
export const openBackgroundTabAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    const currentTabs = _get(storedTabsAtom);
    const existingIndex = findTabIndex(currentTabs, documentId);

    if (existingIndex !== -1) {
      // Tab already exists - make it persistent if it was a preview
      const tab = currentTabs[existingIndex];
      if (tab.mode === "preview") {
        const newTabs = currentTabs.map((t, i) =>
          i === existingIndex ? { ...t, mode: "persistent" as const } : t,
        );
        set(storedTabsAtom, newTabs);
      }
      // Don't activate - keep current tab active
    } else {
      // Add new persistent tab without activating
      let newTabs = [...currentTabs, { documentId, title, mode: "persistent" as const }];
      if (newTabs.length > MAX_TABS) {
        // Remove oldest preview tab, or oldest persistent if no previews
        const oldestPreviewIndex = newTabs.findIndex((t) => t.mode === "preview");
        const removeIndex = oldestPreviewIndex !== -1 ? oldestPreviewIndex : 0;
        newTabs = newTabs.filter((_, i) => i !== removeIndex);
      }
      set(storedTabsAtom, newTabs);
      // Don't set activeTabIdAtom - keep current tab active
    }
  },
);

// Action: Insert a tab at a specific position (used for drag and drop)
export const insertTabAtPositionAtom = atom(
  null,
  (
    _get,
    set,
    { documentId, title, position }: { documentId: string; title: string; position: number },
  ) => {
    const currentTabs = _get(storedTabsAtom);
    const existingIndex = findTabIndex(currentTabs, documentId);

    let newTabs: DocumentTab[];

    if (existingIndex !== -1) {
      // Tab exists - move it to the new position and make it persistent
      const tab = { ...currentTabs[existingIndex], mode: "persistent" as const };
      const withoutExisting = currentTabs.filter((_, i) => i !== existingIndex);
      // Adjust position if removing existing tab shifted indices
      const adjustedPosition = existingIndex < position ? position - 1 : position;
      newTabs = [
        ...withoutExisting.slice(0, adjustedPosition),
        tab,
        ...withoutExisting.slice(adjustedPosition),
      ];
    } else {
      // Insert new tab at position
      const newTab: DocumentTab = { documentId, title, mode: "persistent" as const };
      newTabs = [...currentTabs.slice(0, position), newTab, ...currentTabs.slice(position)];

      // Handle max tabs limit
      if (newTabs.length > MAX_TABS) {
        // Remove oldest preview tab, or oldest persistent if no previews
        const oldestPreviewIndex = newTabs.findIndex((t) => t.mode === "preview");
        const removeIndex = oldestPreviewIndex !== -1 ? oldestPreviewIndex : 0;
        newTabs = newTabs.filter((_, i) => i !== removeIndex);
      }
    }

    set(storedTabsAtom, newTabs);
    set(storedActiveTabIdAtom, documentId);
  },
);

// Action: Reorder tabs (used for drag and drop reordering)
export const reorderTabsAtom = atom(
  null,
  (_get, set, { draggedIds, targetIndex }: { draggedIds: string[]; targetIndex: number }) => {
    const currentTabs = _get(storedTabsAtom);

    // Remove dragged tabs from current positions
    const draggedTabs = currentTabs.filter((t) => draggedIds.includes(t.documentId));
    const remainingTabs = currentTabs.filter((t) => !draggedIds.includes(t.documentId));

    // Insert dragged tabs at target position
    const newTabs = [
      ...remainingTabs.slice(0, targetIndex),
      ...draggedTabs,
      ...remainingTabs.slice(targetIndex),
    ];

    set(storedTabsAtom, newTabs);
  },
);
