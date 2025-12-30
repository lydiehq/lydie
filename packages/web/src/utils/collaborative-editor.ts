import { useEditor, Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextSelectionExtension } from "@/editor/extensions/selection";
import { MarkdownPasteExtension } from "@/editor/extensions/markdown-paste";
import { CharacterCount } from "@tiptap/extension-character-count";
import { DocumentComponent } from "../editor/extensions/document-components";
import { KeyboardShortcutExtension } from "@/editor/extensions/keyboard-shortcuts";
import { IndentHandlerExtension } from "@/editor/extensions/indent-handler";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { useCallback, useMemo, useEffect, useState } from "react";
import { TableKit } from "@tiptap/extension-table";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

export type CollaborativeEditorHookResult = {
  editor: Editor | null;
  setContent: (content: string) => void;
  provider: HocuspocusProvider | null;
  ydoc: Y.Doc | null;
};

// Generate a consistent color for each user based on their ID
function getUserColor(userId: string): string {
  const colors = [
    "#30bced",
    "#6eeb83",
    "#ffbc42",
    "#ecd444",
    "#ee6352",
    "#9ac2c9",
    "#8acb88",
    "#1be7ff",
    "#ff006e",
    "#8338ec",
  ];

  // Simple hash function to get consistent color for user
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function useCollaborativeEditor({
  initialContent,
  documentId,
  onUpdate,
  onSave,
  onTextSelect,
  onAddLink,
  currentUser,
  yjsServerUrl = "ws://localhost:3001/yjs",
}: {
  initialContent: any;
  documentId: string;
  onUpdate?: () => void;
  getApiClient: () => any;
  onSave?: () => void;
  onTextSelect?: (e: any) => void;
  onAddLink?: () => void;
  currentUser?: { id: string; name: string };
  yjsServerUrl?: string;
}): CollaborativeEditorHookResult {
  // Create Yjs document and provider
  const { ydoc, provider } = useMemo(() => {
    if (!documentId) return { ydoc: null, provider: null };

    const doc = new Y.Doc();

    // Construct the WebSocket URL - the server expects /yjs/:documentId
    // Remove the /yjs suffix from the base URL if present, then add /yjs/:documentId
    const baseUrl = yjsServerUrl.replace(/\/yjs\/?$/, "");
    const wsUrl = `${baseUrl}/yjs/${documentId}`;

    console.log(`[CollaborativeEditor] Connecting to: ${wsUrl}`);

    const hocuspocusProvider = new HocuspocusProvider({
      name: documentId,
      url: wsUrl,
      document: doc,
    });

    return { ydoc: doc, provider: hocuspocusProvider };
  }, [documentId, yjsServerUrl]);

  const editor = useEditor(
    {
      autofocus: true,
      extensions: [
        StarterKit.configure({
          heading: {},
          undoRedo: false,
          link: {
            openOnClick: false,
            protocols: ["internal"],
          },
        }),
        TableKit,
        CharacterCount,
        TextSelectionExtension.configure({
          onSelect: onTextSelect,
        }),
        MarkdownPasteExtension,
        KeyboardShortcutExtension.configure({
          onSave,
          onAddLink,
        }),
        DocumentComponent,
        IndentHandlerExtension,
        // Add collaboration extensions
        ...(ydoc
          ? [
              Collaboration.configure({
                document: ydoc,
              }),
              CollaborationCaret.configure({
                provider: provider!,
                user: currentUser
                  ? {
                      name: currentUser.name,
                      color: getUserColor(currentUser.id),
                    }
                  : {
                      name: "Anonymous",
                      color: "#808080",
                    },
              }),
            ]
          : []),
      ],
      // Don't set content when using Collaboration - Yjs document is the source of truth
      // We'll initialize it after provider syncs if the document is empty
      content: ydoc ? undefined : initialContent,
      editorProps: {
        attributes: {
          class: "size-full outline-none editor-content",
        },
      },
      onUpdate,
    },
    [ydoc, provider, initialContent]
  );

  // Initialize Yjs document with existing content if it's empty
  // This happens after the provider syncs and we confirm the document is empty
  useEffect(() => {
    if (!editor || !provider || !ydoc || !initialContent) return;

    let hasInitialized = false;
    let timeoutId: NodeJS.Timeout | null = null;

    // Wait for provider to sync before checking/initializing
    const initializeIfEmpty = () => {
      if (!provider.synced || !editor || hasInitialized) return;

      // Check if Yjs document is empty by checking the XML fragment
      // Collaboration extension uses "default" as the fragment name
      const fragment = ydoc.getXmlFragment("default");
      const isEmpty = fragment.length === 0;

      // Also check if editor is empty (double check)
      if (isEmpty && editor.isEmpty && initialContent) {
        // Initialize with existing content - this will sync to Yjs
        console.log(
          "[CollaborativeEditor] Initializing empty Yjs document with existing content"
        );
        hasInitialized = true;

        // Use a small delay to ensure Collaboration extension is fully ready
        timeoutId = setTimeout(() => {
          if (editor && !editor.isDestroyed && editor.isEmpty) {
            // Only set if still empty (another client might have added content)
            editor.commands.setContent(initialContent);
          }
        }, 200);
      }
    };

    // Try immediately if already synced
    if (provider.synced) {
      initializeIfEmpty();
    } else {
      // Wait for sync event
      provider.on("synced", initializeIfEmpty);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      provider.off("synced", initializeIfEmpty);
    };
  }, [editor, provider, ydoc, initialContent]);

  const setContent = useCallback(
    (content: string) => {
      if (!editor) return;
      editor.commands.setContent(content);
    },
    [editor]
  );

  return { editor, setContent, provider, ydoc };
}
