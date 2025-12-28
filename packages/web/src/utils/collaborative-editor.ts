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
import { WebsocketProvider } from "y-websocket";

export type CollaborativeEditorHookResult = {
  editor: Editor | null;
  setContent: (content: string) => void;
  provider: WebsocketProvider | null;
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
  yjsServerUrl = "ws://localhost:1234",
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
  const [token, setToken] = useState<string | null>(null);

  // Fetch session token from API
  useEffect(() => {
    if (!documentId) return;

    const fetchToken = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "";
        const response = await fetch(`${apiUrl}/internal/public/yjs-token`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(
            `Failed to get session token: ${response.statusText}`
          );
        }

        const data = await response.json();
        setToken(data.token);
      } catch (error) {
        console.error("Error fetching Yjs token:", error);
      }
    };

    fetchToken();
  }, [documentId]);

  // Create Yjs document and provider
  const { ydoc, provider } = useMemo(() => {
    if (!documentId || !token) return { ydoc: null, provider: null };

    const doc = new Y.Doc();

    const wsProvider = new WebsocketProvider(yjsServerUrl, documentId, doc, {
      params: { token },
    });

    return { ydoc: doc, provider: wsProvider };
  }, [documentId, yjsServerUrl, token]);

  const editor = useEditor(
    {
      autofocus: true,
      extensions: [
        StarterKit.configure({
          heading: {},
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
      content: initialContent,
      editorProps: {
        attributes: {
          class: "size-full outline-none editor-content",
        },
      },
      onUpdate,
    },
    [ydoc, provider]
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
