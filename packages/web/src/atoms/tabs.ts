import { atom } from "jotai";

import { storedActiveTabIdAtom, storedDocumentTabsAtom } from "./tabs-storage";

export interface DocumentTab {
  documentId: string;
  title: string;
  isDirty?: boolean;
  isPreview?: boolean;
}

// Maximum number of open tabs
const MAX_TABS = 10;

class TabManager {
  private tabs: DocumentTab[] = [];
  private activeTabId: string | null = null;
  private listeners = new Set<() => void>();

  /**
   * Open a new tab or activate an existing one.
   */
  openTab(documentId: string, title: string, isPreview = false): void {
    const existingIndex = this.tabs.findIndex((t) => t.documentId === documentId);

    if (existingIndex !== -1) {
      // Tab already exists, just activate it
      this.activeTabId = documentId;
      // If it was a preview tab and we're now "committing" to it, mark it as non-preview
      if (!isPreview && this.tabs[existingIndex].isPreview) {
        this.tabs[existingIndex].isPreview = false;
      }
    } else {
      // Add new tab
      if (this.tabs.length >= MAX_TABS) {
        // Remove the oldest non-preview tab
        const oldestNonPreviewIndex = this.tabs.findIndex((t) => !t.isPreview);
        if (oldestNonPreviewIndex !== -1) {
          this.tabs.splice(oldestNonPreviewIndex, 1);
        } else {
          // All tabs are previews, remove the oldest
          this.tabs.shift();
        }
      }

      this.tabs.push({ documentId, title, isPreview });
      this.activeTabId = documentId;
    }

    this.notifyListeners();
  }

  /**
   * Close a tab by document ID.
   */
  closeTab(documentId: string): string | null {
    const index = this.tabs.findIndex((t) => t.documentId === documentId);
    if (index === -1) return this.activeTabId;

    const wasActive = this.tabs[index].documentId === this.activeTabId;
    this.tabs.splice(index, 1);

    if (wasActive) {
      // Activate the tab to the left, or the first tab, or null
      const newActive = this.tabs[index - 1] || this.tabs[0] || null;
      this.activeTabId = newActive?.documentId ?? null;
    }

    this.notifyListeners();
    return this.activeTabId;
  }

  /**
   * Activate a tab by document ID.
   */
  activateTab(documentId: string): void {
    if (this.tabs.find((t) => t.documentId === documentId)) {
      this.activeTabId = documentId;
      this.notifyListeners();
    }
  }

  /**
   * Mark a tab as dirty (unsaved changes).
   */
  markDirty(documentId: string, isDirty: boolean): void {
    const tab = this.tabs.find((t) => t.documentId === documentId);
    if (tab && tab.isDirty !== isDirty) {
      tab.isDirty = isDirty;
      this.notifyListeners();
    }
  }

  /**
   * Update the title of a tab.
   */
  updateTitle(documentId: string, title: string): void {
    const tab = this.tabs.find((t) => t.documentId === documentId);
    if (tab && tab.title !== title) {
      tab.title = title;
      this.notifyListeners();
    }
  }

  /**
   * Replace the current preview tab with a new document.
   * This is used when clicking on documents without opening them fully.
   */
  replacePreviewTab(documentId: string, title: string): void {
    const previewIndex = this.tabs.findIndex((t) => t.isPreview);
    if (previewIndex !== -1) {
      // Replace the existing preview tab
      this.tabs[previewIndex] = { documentId, title, isPreview: true };
    } else {
      // Add a new preview tab
      this.openTab(documentId, title, true);
      return;
    }
    this.activeTabId = documentId;
    this.notifyListeners();
  }

  /**
   * Get all tabs.
   */
  getTabs(): DocumentTab[] {
    return [...this.tabs];
  }

  /**
   * Get the active tab ID.
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * Check if a document has an open tab.
   */
  hasTab(documentId: string): boolean {
    return this.tabs.some((t) => t.documentId === documentId);
  }

  /**
   * Subscribe to tab changes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// Singleton instance
export const tabManager = new TabManager();

// Jotai atoms for reactive access (backed by localStorage)
export const documentTabsAtom = atom<DocumentTab[]>((get) => get(storedDocumentTabsAtom));
export const activeTabIdAtom = atom<string | null>((get) => get(storedActiveTabIdAtom));

// Action atoms for modifying tabs
export const openDocumentTabAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    tabManager.openTab(documentId, title);
    set(storedDocumentTabsAtom, tabManager.getTabs());
    set(storedActiveTabIdAtom, tabManager.getActiveTabId());
  },
);

export const closeDocumentTabAtom = atom(
  null,
  (_get, set, documentId: string) => {
    const nextActiveId = tabManager.closeTab(documentId);
    set(storedDocumentTabsAtom, tabManager.getTabs());
    set(storedActiveTabIdAtom, tabManager.getActiveTabId());
    return nextActiveId;
  },
);

export const activateDocumentTabAtom = atom(
  null,
  (_get, set, documentId: string) => {
    tabManager.activateTab(documentId);
    set(storedActiveTabIdAtom, tabManager.getActiveTabId());
  },
);

export const markTabDirtyAtom = atom(
  null,
  (_get, set, { documentId, isDirty }: { documentId: string; isDirty: boolean }) => {
    tabManager.markDirty(documentId, isDirty);
    set(storedDocumentTabsAtom, tabManager.getTabs());
  },
);

export const updateTabTitleAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    tabManager.updateTitle(documentId, title);
    set(storedDocumentTabsAtom, tabManager.getTabs());
  },
);

export const replacePreviewTabAtom = atom(
  null,
  (_get, set, { documentId, title }: { documentId: string; title: string }) => {
    tabManager.replacePreviewTab(documentId, title);
    set(storedDocumentTabsAtom, tabManager.getTabs());
    set(storedActiveTabIdAtom, tabManager.getActiveTabId());
  },
);
