import type { Editor } from "@tiptap/react";

import { atom } from "jotai";

export interface EditorInstance {
  documentId: string;
  contentEditor: Editor;
  titleEditor: Editor;
  registeredAt: number;
  lastAccessed: number;
}

export interface PendingEditorChange {
  documentId: string;
  title?: string;
  search: string;
  replace: string;
  organizationId: string;
}

export type PendingChangeStatus = "pending" | "applying" | "applied" | "failed" | null;

// Maximum number of editor instances to keep in memory
const MAX_INSTANCES = 5;

// Time before an inactive editor instance can be cleaned up (5 minutes)
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

class EditorRegistry {
  private instances = new Map<string, EditorInstance>();
  private listeners = new Set<() => void>();

  /**
   * Register a new editor instance for a document.
   * If an instance already exists, it will be updated.
   */
  register(documentId: string, contentEditor: Editor, titleEditor: Editor): EditorInstance {
    const existing = this.instances.get(documentId);

    if (existing) {
      // Update existing instance
      existing.contentEditor = contentEditor;
      existing.titleEditor = titleEditor;
      existing.lastAccessed = Date.now();
      this.notifyListeners();
      return existing;
    }

    // Enforce max instances limit
    if (this.instances.size >= MAX_INSTANCES) {
      this.cleanupOldestInstance();
    }

    const instance: EditorInstance = {
      documentId,
      contentEditor,
      titleEditor,
      registeredAt: Date.now(),
      lastAccessed: Date.now(),
    };

    this.instances.set(documentId, instance);
    this.notifyListeners();
    return instance;
  }

  /**
   * Unregister an editor instance.
   * Optionally destroy the editors if cleanup is true.
   */
  unregister(documentId: string, cleanup = false): void {
    const instance = this.instances.get(documentId);
    if (!instance) return;

    if (cleanup) {
      instance.contentEditor.destroy();
      instance.titleEditor.destroy();
    }

    this.instances.delete(documentId);
    this.notifyListeners();
  }

  /**
   * Get an editor instance by document ID.
   */
  get(documentId: string): EditorInstance | undefined {
    const instance = this.instances.get(documentId);
    if (instance) {
      instance.lastAccessed = Date.now();
    }
    return instance;
  }

  /**
   * Check if an instance exists for a document.
   */
  has(documentId: string): boolean {
    return this.instances.has(documentId);
  }

  /**
   * Get all registered document IDs.
   */
  getDocumentIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Get all instances.
   */
  getAllInstances(): EditorInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Update the last accessed time for an instance.
   */
  touch(documentId: string): void {
    const instance = this.instances.get(documentId);
    if (instance) {
      instance.lastAccessed = Date.now();
    }
  }

  /**
   * Subscribe to registry changes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Clean up the oldest idle instance.
   */
  private cleanupOldestInstance(): void {
    let oldest: EditorInstance | undefined;
    let oldestTime = Infinity;

    for (const instance of this.instances.values()) {
      if (instance.lastAccessed < oldestTime) {
        oldest = instance;
        oldestTime = instance.lastAccessed;
      }
    }

    if (oldest && Date.now() - oldest.lastAccessed > IDLE_TIMEOUT_MS) {
      this.unregister(oldest.documentId, true);
    }
  }

  /**
   * Clean up all idle instances.
   */
  cleanupIdle(): void {
    const now = Date.now();
    for (const [documentId, instance] of this.instances) {
      if (now - instance.lastAccessed > IDLE_TIMEOUT_MS) {
        this.unregister(documentId, true);
      }
    }
  }

  /**
   * Destroy all instances and clean up.
   */
  destroy(): void {
    for (const instance of this.instances.values()) {
      instance.contentEditor.destroy();
      instance.titleEditor.destroy();
    }
    this.instances.clear();
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Get debug info about the registry.
   */
  getDebugInfo() {
    return {
      instanceCount: this.instances.size,
      documentIds: this.getDocumentIds(),
      instances: Array.from(this.instances.entries()).map(([id, instance]) => ({
        documentId: id,
        registeredAt: new Date(instance.registeredAt).toISOString(),
        lastAccessed: new Date(instance.lastAccessed).toISOString(),
        idleMs: Date.now() - instance.lastAccessed,
      })),
    };
  }
}

// Singleton instance
export const editorRegistry = new EditorRegistry();

// Jotai atoms for reactive access
export const activeDocumentIdAtom = atom<string | null>(null);

// Atom that returns the current editor instance for the active document
export const activeEditorInstanceAtom = atom((get) => {
  const activeId = get(activeDocumentIdAtom);
  if (!activeId) return null;
  return editorRegistry.get(activeId) ?? null;
});

// Atom for pending changes (supports per-document tracking via documentId in the change)
export const pendingEditorChangeAtom = atom<PendingEditorChange | null>(null);
export const pendingChangeStatusAtom = atom<PendingChangeStatus>(null);
