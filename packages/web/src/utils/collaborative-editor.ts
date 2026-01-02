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
import { useCallback, useMemo } from "react";
import { TableKit } from "@tiptap/extension-table";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { QueryResultType } from "@rocicorp/zero";
import type { queries } from "@lydie/zero/queries";
import { useAuth } from "@/context/auth.context";

export type CollaborativeEditorHookResult = {
  editor: Editor | null;
  setContent: (content: string) => void;
  provider: HocuspocusProvider | null;
  ydoc: Y.Doc | null;
};

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

type UseCollaborativeEditorProps = {
  onUpdate?: () => void;
  onSave?: () => void;
  onTextSelect?: (e: any) => void;
  onAddLink?: () => void;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
};

const yjsServerUrl =
  import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001";

export function useCollaborativeEditor({
  doc,
  onUpdate,
  onSave,
  onTextSelect,
  onAddLink,
}: UseCollaborativeEditorProps): CollaborativeEditorHookResult {
  const { user } = useAuth();
  const { ydoc, provider } = useMemo(() => {
    if (!doc.id) return { ydoc: null, provider: null };

    const yjsState = new Y.Doc();

    // Initialize document with existing state if available
    if (doc.yjs_state) {
      try {
        const bytes = Uint8Array.from(atob(doc.yjs_state), (c) =>
          c.charCodeAt(0)
        );
        Y.applyUpdate(yjsState, bytes);
      } catch (error) {
        console.error(
          "[CollaborativeEditor] Error applying initial Yjs state:",
          error
        );
      }
    }

    const hocuspocusProvider = new HocuspocusProvider({
      name: doc.id,
      url: `${yjsServerUrl}/${doc.id}`,
      document: yjsState,
    });

    return { ydoc: yjsState, provider: hocuspocusProvider };
  }, [doc.id, doc.yjs_state, yjsServerUrl]);

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
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCaret.configure({
          provider,
          user: user
            ? {
                name: user.name,
                color: getUserColor(user.id),
              }
            : {
                name: "Anonymous",
                color: "#808080",
              },
        }),
      ],
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
