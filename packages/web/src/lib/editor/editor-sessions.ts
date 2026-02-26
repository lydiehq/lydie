import type { HocuspocusProvider } from "@hocuspocus/provider";
import { getDocumentEditorExtensions, getTitleExtensions } from "@lydie/editor";
import { renderCollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret";
import type { Schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";
import type { Editor } from "@tiptap/react";
import { Editor as TipTapEditor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { createElement } from "react";
import type * as Y from "yjs";

import { CodeBlockComponent } from "@/components/CodeBlockComponent";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { CollectionViewBlockComponent } from "@/components/editor/CollectionViewBlockComponent";
import {
  createMentionMenuSuggestion,
  getMentionCommandAction,
} from "@/components/editor/MentionMenu";
import { OnboardingAssistantTaskView } from "@/components/editor/onboarding/OnboardingAssistantTaskView";
import { OnboardingTextPracticeView } from "@/components/editor/onboarding/OnboardingTextPracticeView";
import { createSlashMenuSuggestion, getSlashCommandAction } from "@/components/editor/SlashMenu";
import { PlaceholderComponent } from "@/components/PlaceholderComponent";

import { documentConnectionManager } from "./document-connection-manager";

export interface EditorSession {
  documentId: string;
  contentEditor: Editor;
  titleEditor: Editor;
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
}

/**
 * EditorSessions - one editor session per open document tab.
 *
 * This module does NOT track which document is "active" - that lives in
 * the tab atoms. It only owns editor lifecycle for documents that are open.
 */
class EditorSessions {
  private editors = new Map<string, EditorSession>();

  /**
   * Get or create an editor session for a document.
   * Returns an existing session when present.
   */
  getOrCreate(
    documentId: string,
    userName: string,
    yjsState: string | null,
    initialTitle: string,
    organizationId: string,
    organizationSlug: string,
    zero: Zero<Schema>,
  ): EditorSession {
    const existing = this.editors.get(documentId);

    if (existing) {
      return existing;
    }

    // Create new editor instance
    const session = this.createEditor(
      documentId,
      userName,
      yjsState,
      initialTitle,
      organizationId,
      organizationSlug,
      zero,
    );
    this.editors.set(documentId, session);

    return session;
  }

  /**
   * Get an existing editor session.
   */
  get(documentId: string): EditorSession | undefined {
    return this.editors.get(documentId);
  }

  /**
   * Check if an editor exists for a document.
   */
  has(documentId: string): boolean {
    return this.editors.has(documentId);
  }

  /**
   * Remove an editor session and destroy it.
   * Called when a tab is closed.
   */
  remove(documentId: string): void {
    const session = this.editors.get(documentId);
    if (!session) return;

    // Cleanup DOM if editor has been mounted
    // The view throws if accessed before mounting, so we catch errors
    try {
      const dom = session.contentEditor.view.dom as HTMLElement;
      if (dom.parentNode) {
        dom.parentNode.removeChild(dom);
      }
    } catch {
      // View not available (editor never mounted), no DOM to cleanup
    }

    // Destroy editors (this cleans up the view)
    session.contentEditor.destroy();
    session.titleEditor.destroy();

    // Cleanup connection
    documentConnectionManager.cleanup(documentId);

    this.editors.delete(documentId);
  }

  /**
   * Get all active document IDs.
   */
  getDocumentIds(): string[] {
    return Array.from(this.editors.keys());
  }

  /**
   * Destroy all editors and clear sessions.
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
   * Get debug info about active sessions.
   */
  getDebugInfo() {
    return {
      count: this.editors.size,
      editors: Array.from(this.editors.keys()),
    };
  }

  private createEditor(
    documentId: string,
    userName: string,
    yjsState: string | null,
    initialTitle: string,
    organizationId: string,
    organizationSlug: string,
    zero: Zero<Schema>,
  ): EditorSession {
    // Get connection from manager
    const connection = documentConnectionManager.getConnection(documentId, yjsState);

    let contentEditor: Editor | null = null;

    // Create title editor
    const titleEditor = new TipTapEditor({
      autofocus: true,
      editable: true,
      extensions: getTitleExtensions({
        placeholder: "Untitled",
        onEnter: () => {
          contentEditor?.commands.focus("start");
        },
      }),
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
            "focus:outline-none text-[1.75rem] leading-[calc(2/1.75)] font-medium text-gray-950 py-4 tracking-[-0.05rem]",
        },
      },
    });

    // Create content editor
    contentEditor = new TipTapEditor({
      autofocus: false,
      editable: true,
      extensions: getDocumentEditorExtensions({
        documentComponent: {
          addNodeView: () => ReactNodeViewRenderer(DocumentComponentComponent),
        },
        codeBlock: {
          addNodeView: () => ReactNodeViewRenderer(CodeBlockComponent),
        },
        collectionViewBlock: {
          addNodeView: () => {
            const orgId = organizationId;
            const orgSlug = organizationSlug;
            return ReactNodeViewRenderer((nodeViewProps) =>
              createElement(CollectionViewBlockComponent, {
                ...nodeViewProps,
                documentId,
                organizationId: orgId,
                organizationSlug: orgSlug,
              }),
            );
          },
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
            ...createSlashMenuSuggestion(organizationId, zero),
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
          "data-doc-content": "",
        },
      },
    });

    if (!contentEditor) {
      throw new Error("Failed to initialize content editor");
    }

    return {
      documentId,
      contentEditor,
      titleEditor,
      ydoc: connection.ydoc,
      provider: connection.provider,
    };
  }
}

// Singleton instance
export const editorSessions = new EditorSessions();
