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
import { ImageUpload } from "@/editor/extensions/image-upload";
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { TableKit } from "@tiptap/extension-table";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useZero } from "@rocicorp/zero/react";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { mutators } from "@lydie/zero/mutators";

export type CollaborativeEditorHookResult = {
  editor: Editor | null;
  setContent: (content: string) => void;
  provider: HocuspocusProvider | null;
  ydoc: Y.Doc | null;
};

// Helper function to convert Uint8Array to base64
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = "";
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

// Helper function to convert base64 to Uint8Array
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Debounce function
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

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
  documentId,
  organizationId,
  onUpdate,
  onSave,
  onTextSelect,
  onAddLink,
  currentUser,
  yjsServerUrl,
}: {
  documentId: string;
  organizationId: string;
  onUpdate?: () => void;
  onSave?: () => void;
  onTextSelect?: (e: any) => void;
  onAddLink?: () => void;
  currentUser?: { id: string; name: string };
  yjsServerUrl?: string;
}): CollaborativeEditorHookResult {
  const z = useZero();
  const updateQueueRef = useRef<Uint8Array[]>([]);
  const appliedPatchesRef = useRef<Set<string>>(new Set());
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);

  // Query document and patches from Zero
  const [document] = useQuery(
    queries.documents.byId({ documentId, organizationId })
  );
  const [patches] = useQuery(
    queries.documents.patches({ documentId, organizationId })
  );

  // Create Yjs document
  const ydoc = useMemo(() => {
    if (!documentId) return null;
    return new Y.Doc();
  }, [documentId]);

  // Create optional Hocuspocus provider for awareness only
  const provider = useMemo(() => {
    if (!documentId || !yjsServerUrl || !ydoc) return null;

    // Construct the WebSocket URL - the server expects /yjs/:documentId
    const baseUrl = yjsServerUrl.replace(/\/yjs\/?$/, "");
    const wsUrl = `${baseUrl}/yjs/${documentId}`;

    console.log(
      `[CollaborativeEditor] Connecting to Hocuspocus for awareness: ${wsUrl}`
    );

    // Create provider but only for awareness, not for document sync
    const hocuspocusProvider = new HocuspocusProvider({
      name: documentId,
      url: wsUrl,
      document: ydoc,
    });

    return hocuspocusProvider;
  }, [documentId, yjsServerUrl, ydoc]);

  // Load document state from Zero (snapshot + patches)
  useEffect(() => {
    if (!ydoc || !document || isDocumentLoaded) return;

    console.log("[CollaborativeEditor] Loading document state from Zero");

    // Apply base snapshot if exists
    if (document.yjs_snapshot) {
      try {
        Y.applyUpdate(ydoc, base64ToArrayBuffer(document.yjs_snapshot));
        console.log("[CollaborativeEditor] Applied snapshot");
      } catch (error) {
        console.error("[CollaborativeEditor] Error applying snapshot:", error);
      }
    }

    // Apply all patches in order
    if (patches && patches.length > 0) {
      console.log(`[CollaborativeEditor] Applying ${patches.length} patches`);
      for (const patch of patches) {
        try {
          Y.applyUpdate(ydoc, base64ToArrayBuffer(patch.patch), "zero-sync");
          appliedPatchesRef.current.add(patch.id);
        } catch (error) {
          console.error("[CollaborativeEditor] Error applying patch:", error);
        }
      }
    }

    setIsDocumentLoaded(true);
  }, [ydoc, document, patches, isDocumentLoaded]);

  // Debounced function to sync updates to Zero
  const syncToZero = useMemo(
    () =>
      debounce(() => {
        if (updateQueueRef.current.length === 0) return;

        // Merge all queued updates
        const mergedUpdate = Y.mergeUpdates(updateQueueRef.current);
        const updateBase64 = arrayBufferToBase64(mergedUpdate);

        // Clear the queue
        updateQueueRef.current = [];

        // Send to Zero
        console.log("[CollaborativeEditor] Syncing update to Zero");
        z.mutate(
          mutators.document.applyUpdate({
            documentId,
            organizationId,
            update: updateBase64,
          })
        );
      }, 5),
    [z, documentId, organizationId]
  );

  // Listen for Yjs updates and queue them
  useEffect(() => {
    if (!ydoc || !isDocumentLoaded) return;

    const handleUpdate = (update: Uint8Array, origin: any) => {
      // Ignore updates from Zero sync (to avoid loops)
      if (origin === "zero-sync") return;

      // Queue the update
      updateQueueRef.current.push(update);

      // Trigger debounced sync
      syncToZero();
    };

    ydoc.on("update", handleUpdate);

    return () => {
      ydoc.off("update", handleUpdate);
    };
  }, [ydoc, isDocumentLoaded, syncToZero]);

  // Listen for patches from Zero and apply them
  useEffect(() => {
    if (!ydoc || !isDocumentLoaded || !patches) return;

    // Apply any new patches that we haven't seen yet
    for (const patch of patches) {
      if (!appliedPatchesRef.current.has(patch.id)) {
        try {
          Y.applyUpdate(ydoc, base64ToArrayBuffer(patch.patch), "zero-sync");
          appliedPatchesRef.current.add(patch.id);
          console.log(
            `[CollaborativeEditor] Applied patch ${patch.id} from Zero`
          );
        } catch (error) {
          console.error(
            "[CollaborativeEditor] Error applying patch from Zero:",
            error
          );
        }
      }
    }
  }, [patches, ydoc, isDocumentLoaded]);

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
        ImageUpload,
        // Add collaboration extensions
        ...(ydoc
          ? [
              Collaboration.configure({
                document: ydoc,
              }),
              // Only add CollaborationCaret if we have a provider (awareness)
              ...(provider
                ? [
                    CollaborationCaret.configure({
                      provider: provider,
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
            ]
          : []),
      ],
      // Don't set content when using Collaboration - Yjs document is the source of truth
      content: undefined,
      editorProps: {
        attributes: {
          class: "size-full outline-none editor-content",
        },
      },
      onUpdate,
    },
    [ydoc, provider, isDocumentLoaded]
  );

  const setContent = useCallback(
    (content: string) => {
      if (!editor) return;
      editor.commands.setContent(content);
    },
    [editor]
  );

  return { editor, setContent, provider, ydoc };
}
