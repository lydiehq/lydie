import { useEditor, Editor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { getContentExtensions } from "@lydie/editor/content";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { useCallback, useMemo } from "react";
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
  const isLocked = doc.is_locked ?? false;

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

  const editor = useEditor({
    autofocus: !isLocked,
    editable: !isLocked,
    extensions: getContentExtensions({
      textSelection: {
        enabled: true,
        onSelect: onTextSelect,
      },
      keyboardShortcuts: {
        enabled: true,
        onSave,
        onAddLink,
      },
      starterKit: {
        heading: {},
        undoRedo: false,
        link: {
          openOnClick: false,
          protocols: ["internal"],
        },
      },
      documentComponent: {
        enabled: true,
        addNodeView: () => ReactNodeViewRenderer(DocumentComponentComponent),
      },
      collaboration: ydoc
        ? {
            document: ydoc,
            provider: provider || undefined,
            user: user
              ? {
                  name: user.name,
                  color: getUserColor(user.id),
                }
              : {
                  name: "Anonymous",
                  color: "#808080",
                },
          }
        : undefined,
    }),
    editorProps: {
      attributes: {
        class: `size-full outline-none editor-content ${
          isLocked ? "cursor-default" : ""
        }`,
      },
    },
    onUpdate: isLocked ? undefined : onUpdate,
  });

  const setContent = useCallback(
    (content: string) => {
      if (!editor) return;
      editor.commands.setContent(content);
    },
    [editor]
  );

  return { editor, setContent, provider, ydoc };
}
