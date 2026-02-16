import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";

import { getDocumentEditorExtensions, getTitleExtensions } from "@lydie/editor";
import { renderCollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret";
import { Editor as TipTapEditor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { CodeBlockComponent } from "@/components/CodeBlockComponent";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import {
  createMentionMenuSuggestion,
  getMentionCommandAction,
} from "@/components/editor/MentionMenu";
import { OnboardingAssistantTaskView } from "@/components/editor/onboarding/OnboardingAssistantTaskView";
import { OnboardingTextPracticeView } from "@/components/editor/onboarding/OnboardingTextPracticeView";
import { createSlashMenuSuggestion, getSlashCommandAction } from "@/components/editor/SlashMenu";
import { PlaceholderComponent } from "@/components/PlaceholderComponent";

import { documentConnectionManager } from "./document-connection-manager";

export interface CachedEditor {
  documentId: string;
  contentEditor: Editor;
  titleEditor: Editor;
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  container: HTMLDivElement;
  lastUsed: number;
  userId: string;
}

const MAX_EDITORS = 8;

/**
 * EditorCache - Lightweight multiplexing for TipTap editors
 *
 * Keeps editors alive in memory across tab switches.
 * LRU eviction when exceeding MAX_EDITORS limit.
 *
 * This cache does NOT track which document is "active" - that's handled
 * by the tab system in @/atoms/tabs. This cache only manages editor
 * lifecycle and memory limits.
 */
class EditorCache {
  private editors = new Map<string, CachedEditor>();

  /**
   * Get or create an editor for a document.
   * Returns the cached instance if it exists, creates new otherwise.
   * Updates lastUsed timestamp for LRU tracking.
   */
  getOrCreate(
    documentId: string,
    userId: string,
    userName: string,
    yjsState: string | null,
    isLocked: boolean,
    initialTitle: string,
  ): CachedEditor {
    const existing = this.editors.get(documentId);

    if (existing) {
      existing.lastUsed = Date.now();
      return existing;
    }

    // Create new editor instance
    const cached = this.createEditor(
      documentId,
      userId,
      userName,
      yjsState,
      isLocked,
      initialTitle,
    );
    this.editors.set(documentId, cached);

    // Evict oldest if over limit
    if (this.editors.size > MAX_EDITORS) {
      this.evictLRU(documentId);
    }

    return cached;
  }

  /**
   * Get an existing cached editor.
   * Does NOT update lastUsed - call touch() if accessing for activity.
   */
  get(documentId: string): CachedEditor | undefined {
    return this.editors.get(documentId);
  }

  /**
   * Check if an editor exists for a document.
   */
  has(documentId: string): boolean {
    return this.editors.has(documentId);
  }

  /**
   * Update lastUsed timestamp for LRU tracking.
   * Call this when the user is actively working on this document.
   */
  touch(documentId: string): void {
    const cached = this.editors.get(documentId);
    if (cached) {
      cached.lastUsed = Date.now();
    }
  }

  /**
   * Remove an editor from cache and destroy it.
   * Called when a tab is closed.
   */
  remove(documentId: string): void {
    const cached = this.editors.get(documentId);
    if (!cached) return;

    // Cleanup DOM if editor has been mounted
    // The view throws if accessed before mounting, so we catch errors
    try {
      const dom = cached.contentEditor.view.dom as HTMLElement;
      if (dom.parentNode) {
        dom.parentNode.removeChild(dom);
      }
    } catch {
      // View not available (editor never mounted), no DOM to cleanup
    }

    // Destroy editors (this cleans up the view)
    cached.contentEditor.destroy();
    cached.titleEditor.destroy();

    // Cleanup connection
    documentConnectionManager.cleanup(documentId);

    this.editors.delete(documentId);
  }

  /**
   * Get all cached document IDs.
   */
  getDocumentIds(): string[] {
    return Array.from(this.editors.keys());
  }

  /**
   * Destroy all editors and clear cache.
   */
  destroy(): void {
    for (const cached of this.editors.values()) {
      cached.contentEditor.destroy();
      cached.titleEditor.destroy();
      documentConnectionManager.cleanup(cached.documentId);
    }
    this.editors.clear();
  }

  /**
   * Get debug info about the cache.
   */
  getDebugInfo() {
    return {
      count: this.editors.size,
      editors: Array.from(this.editors.entries()).map(([id, e]) => ({
        documentId: id,
        lastUsed: new Date(e.lastUsed).toISOString(),
        idleMs: Date.now() - e.lastUsed,
      })),
    };
  }

  private createEditor(
    documentId: string,
    userId: string,
    userName: string,
    yjsState: string | null,
    isLocked: boolean,
    initialTitle: string,
  ): CachedEditor {
    // Get connection from manager
    const connection = documentConnectionManager.getConnection(documentId, yjsState);

    // Create container for editor DOM
    const container = document.createElement("div");
    container.className = "size-full";

    // Create title editor
    const titleEditor = new TipTapEditor({
      autofocus: !isLocked,
      editable: !isLocked,
      extensions: getTitleExtensions({ placeholder: "Untitled" }),
      content: initialTitle
        ? {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 1 },
                content: [{ type: "text", text: initialTitle }],
              },
            ],
          }
        : {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 1 },
                content: [],
              },
            ],
          },
      editorProps: {
        attributes: {
          class:
            "focus:outline-none text-[1.75rem] leading-[calc(2/1.75)] font-medium text-gray-950 py-4",
        },
      },
    });

    // Create content editor
    const contentEditor = new TipTapEditor({
      autofocus: !isLocked,
      editable: !isLocked,
      extensions: getDocumentEditorExtensions({
        documentComponent: {
          addNodeView: () => ReactNodeViewRenderer(DocumentComponentComponent),
        },
        codeBlock: {
          addNodeView: () => ReactNodeViewRenderer(CodeBlockComponent),
        },
        onboardingTextPractice: {
          addNodeView: () => ReactNodeViewRenderer(OnboardingTextPracticeView),
        },
        onboardingAssistantTask: {
          addNodeView: () => ReactNodeViewRenderer(OnboardingAssistantTaskView),
        },
        placeholder: {
          addNodeView: () => ReactNodeViewRenderer(PlaceholderComponent, { as: "span" }),
        },
        collaboration: { document: connection.ydoc },
        collaborationCaret: {
          provider: connection.provider,
          user: { name: userName, color: "#808080" },
          render: renderCollaborationCaret,
        },
        slashCommands: {
          suggestion: {
            ...createSlashMenuSuggestion(),
            command: ({ editor, range, props }: any) => {
              getSlashCommandAction(props, editor, range)();
            },
          },
        },
        mentionCommands: {
          suggestion: {
            ...createMentionMenuSuggestion(),
            command: ({ editor, range, props }: any) => {
              getMentionCommandAction(props, editor, range)();
            },
          },
        },
      }),
      editorProps: {
        attributes: {
          class: "size-full outline-none editor-content pb-8",
        },
      },
    });

    // Append editor DOM to container
    const contentDom = contentEditor.view.dom as HTMLElement;
    container.appendChild(contentDom);

    return {
      documentId,
      contentEditor,
      titleEditor,
      ydoc: connection.ydoc,
      provider: connection.provider,
      container,
      lastUsed: Date.now(),
      userId,
    };
  }

  private evictLRU(currentDocumentId: string): void {
    // Find oldest (excluding the one we just created)
    const entries = Array.from(this.editors.entries()).filter(([id]) => id !== currentDocumentId);

    if (entries.length === 0) return;

    const oldest = entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (oldest) {
      this.remove(oldest[0]);
    }
  }
}

// Singleton instance
export const editorCache = new EditorCache();
