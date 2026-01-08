import { useEditor, Editor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { getDocumentEditorExtensions } from "@lydie/editor/document-editor";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { CodeBlockComponent } from "@/components/CodeBlockComponent";
import { useCallback, useMemo } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { QueryResultType } from "@rocicorp/zero";
import type { queries } from "@lydie/zero/queries";
import { useAuth } from "@/context/auth.context";
import { useImageUpload } from "@/hooks/use-image-upload";
import type { EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import { base64ToUint8Array } from "@lydie/core/lib/base64";

export type DocumentEditorHookResult = {
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

type UseDocumentEditorProps = {
  onUpdate?: () => void;
  onSave?: () => void;
  onTextSelect?: (e: any) => void;
  onAddLink?: () => void;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
};

const yjsServerUrl =
  import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001";

export function useDocumentEditor({
  doc,
  onUpdate,
  onSave,
  onTextSelect,
  onAddLink,
}: UseDocumentEditorProps): DocumentEditorHookResult {
  const { user } = useAuth();
  const { uploadImage } = useImageUpload();
  const isLocked = doc.is_locked ?? false;

  const { ydoc, provider } = useMemo(() => {
    if (!doc.id) return { ydoc: null, provider: null };

    const yjsState = new Y.Doc();

    // Initialize document with existing state if available
    if (doc.yjs_state) {
      try {
        const bytes = base64ToUint8Array(doc.yjs_state);
        Y.applyUpdate(yjsState, bytes);
      } catch (error) {
        console.error(
          "[DocumentEditor] Error applying initial Yjs state:",
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
  }, [doc.id, doc.yjs_state]);

  const userInfo = useMemo(() => {
    return user
      ? {
          name: user.name,
          color: getUserColor(user.id),
        }
      : {
          name: "Anonymous",
          color: "#808080",
        };
  }, [user?.id, user?.name]);

  const extensions = useMemo(() => {
    return getDocumentEditorExtensions({
      textSelection: {
        onSelect: onTextSelect,
      },
      keyboardShortcuts: {
        onSave,
        onAddLink,
      },
      documentComponent: {
        addNodeView: () => ReactNodeViewRenderer(DocumentComponentComponent),
      },
      codeBlock: {
        addNodeView: () => ReactNodeViewRenderer(CodeBlockComponent),
      },
      collaboration: {
        document: ydoc,
      },
      collaborationCaret: {
        provider,
        user: userInfo,
      },
    });
  }, [ydoc, provider, userInfo, onTextSelect, onSave, onAddLink]);

  const editor = useEditor({
    autofocus: !isLocked,
    editable: !isLocked,
    extensions,
    editorProps: {
      attributes: {
        class: "size-full outline-none editor-content",
      },
      handleDrop: isLocked ? undefined : createImageDropHandler(uploadImage),
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

function createImageDropHandler(uploadImage: (file: File) => Promise<string>) {
  return function (
    view: EditorView,
    event: DragEvent,
    _slice: Slice,
    moved: boolean
  ): boolean {
    // Only handle external file drops (not moving content within editor)
    if (
      !moved &&
      event.dataTransfer &&
      event.dataTransfer.files &&
      event.dataTransfer.files[0]
    ) {
      const file = event.dataTransfer.files[0];
      const filesize = (file.size / 1024 / 1024).toFixed(4); // Size in MB

      // Validate image type and size (allow jpeg, png, webp, gif under 10MB)
      const validImageTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (validImageTypes.includes(file.type) && parseFloat(filesize) < 10) {
        // Check image dimensions
        const _URL = window.URL || window.webkitURL;
        const img = new Image();
        img.src = _URL.createObjectURL(file);
        img.onload = function () {
          // Allow images up to 5000px in width/height
          if (img.width > 5000 || img.height > 5000) {
            window.alert(
              "Your images need to be less than 5000 pixels in height and width."
            );
            _URL.revokeObjectURL(img.src);
            return;
          }

          // Upload the image
          uploadImage(file)
            .then(function (url) {
              // Pre-load the image before inserting to avoid delay
              const preloadImg = new Image();
              preloadImg.src = url;
              preloadImg.onload = function () {
                // Insert the image at the drop position
                const { schema } = view.state;
                const coordinates = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });
                if (coordinates) {
                  const node = schema.nodes.image.create({ src: url });
                  const transaction = view.state.tr.insert(
                    coordinates.pos,
                    node
                  );
                  view.dispatch(transaction);
                }
              };
              preloadImg.onerror = function () {
                window.alert(
                  "There was a problem loading your image, please try again."
                );
              };
            })
            .catch(function (error) {
              console.error("Failed to upload image:", error);
              window.alert(
                "There was a problem uploading your image, please try again."
              );
            })
            .finally(() => {
              _URL.revokeObjectURL(img.src);
            });
        };
        img.onerror = function () {
          _URL.revokeObjectURL(img.src);
          window.alert("Invalid image file. Please try again.");
        };

        return true; // Handled
      } else {
        window.alert(
          "Images need to be in jpg, png, webp, or gif format and less than 10MB in size."
        );
        return true; // Handled (even if invalid)
      }
    }
    return false; // Not handled, use default behaviour
  };
}
