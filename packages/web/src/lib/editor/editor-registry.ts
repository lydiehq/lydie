import type { Editor } from "@tiptap/react";

import { atom } from "jotai";

import { activeTabIdAtom } from "@/atoms/tabs";

import { editorCache, type CachedEditor } from "./editor-cache";

// Re-export cache types
export type { CachedEditor as EditorInstance } from "./editor-cache";

/**
 * Active document tracking is consolidated in @/atoms/tabs.
 * activeTabIdAtom is the single source of truth.
 * We re-export it here as activeDocumentIdAtom for backward compatibility.
 */
export { activeTabIdAtom as activeDocumentIdAtom } from "@/atoms/tabs";

export interface PendingEditorChange {
  documentId: string;
  title?: string;
  selectionWithEllipsis: string;
  replace: string;
  organizationId: string;
}

export type PendingChangeStatus = "pending" | "applying" | "applied" | "failed" | null;

/**
 * EditorRegistry - Legacy registry that now delegates to EditorCache
 *
 * This registry provides a compatibility layer for code that expects
 * the old registry interface, but internally uses the new EditorCache
 * for DOM multiplexing.
 *
 * NOTE: Active document tracking is consolidated in @/atoms/tabs.
 * This registry no longer tracks active state - it only manages editor instances.
 */
class EditorRegistry {
  /**
   * Register a new editor instance for a document.
   * Delegates to EditorCache.
   */
  register(documentId: string, _contentEditor: Editor, _titleEditor: Editor): CachedEditor {
    // Update the cached editor if it exists
    const cached = editorCache.get(documentId);
    if (cached) {
      // Update with new editor references if they changed
      // This handles React re-renders that create new editor instances
      return cached;
    }
    // Editor should already be created by EditorCache
    // This method is kept for backward compatibility
    return editorCache.get(documentId)!;
  }

  /**
   * Unregister an editor instance.
   * If cleanup is true, destroys the editor.
   */
  unregister(documentId: string, cleanup = false): void {
    if (cleanup) {
      editorCache.remove(documentId);
    }
  }

  /**
   * Get an editor instance by document ID.
   * Delegates to EditorCache.
   */
  get(documentId: string): CachedEditor | undefined {
    return editorCache.get(documentId);
  }

  /**
   * Check if an instance exists for a document.
   */
  has(documentId: string): boolean {
    return editorCache.has(documentId);
  }

  /**
   * Get all registered document IDs.
   */
  getDocumentIds(): string[] {
    return editorCache.getDocumentIds();
  }

  /**
   * Get all instances.
   */
  getAllInstances(): CachedEditor[] {
    return editorCache
      .getDocumentIds()
      .map((id) => editorCache.get(id)!)
      .filter(Boolean);
  }

  /**
   * Update the last accessed time for an instance.
   * This affects LRU eviction priority.
   */
  touch(documentId: string): void {
    editorCache.touch(documentId);
  }

  /**
   * Destroy all instances and clean up.
   */
  destroy(): void {
    editorCache.destroy();
  }

  /**
   * Get debug info about the registry.
   */
  getDebugInfo() {
    return editorCache.getDebugInfo();
  }
}

// Singleton instance
export const editorRegistry = new EditorRegistry();

// Re-export the cache for direct access
export { editorCache };

/**
 * Atom that returns the current editor instance for the active document.
 * Derives active document from the tab system (single source of truth).
 */
export const activeEditorInstanceAtom = atom((get) => {
  const activeId = get(activeTabIdAtom);
  if (!activeId) return null;
  return editorCache.get(activeId) ?? null;
});

// Atom for pending changes (supports per-document tracking via documentId in the change)
export const pendingEditorChangeAtom = atom<PendingEditorChange | null>(null);
export const pendingChangeStatusAtom = atom<PendingChangeStatus>(null);

/**
 * Documentation: Active Document Tracking
 *
 * The active document ID is now managed in ONE place: @/atoms/tabs
 *
 * - activeTabIdAtom (tabs.ts): The single source of truth for which document
 *   tab is currently active/visible in the UI.
 *
 * - EditorCache: Manages editor instances and LRU eviction, but does NOT track
 *   which document is "active". It only tracks lastUsed timestamps for memory
 *   management.
 *
 * - EditorRegistry: Provides backward compatibility and derives its active state
 *   from the tab system via activeEditorInstanceAtom.
 *
 * - Editor.tsx: Calls editorCache.getOrCreate() during render to ensure editors
 *   are available synchronously. The tab system handles all navigation.
 */
