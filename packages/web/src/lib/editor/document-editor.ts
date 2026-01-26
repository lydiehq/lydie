import type { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import type { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { base64ToUint8Array } from "@lydie/core/lib/base64";
import { getDocumentEditorExtensions } from "@lydie/editor/document-editor";
import { Editor, useEditor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";

import { getSharedWebSocket } from "./shared-websocket";

import { CodeBlockComponent } from "@/components/CodeBlockComponent";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { OnboardingStepView } from "@/components/editor/OnboardingStepView";
import { OnboardingTextPracticeView } from "@/components/editor/OnboardingTextPracticeView";
import { OnboardingAssistantTaskView } from "@/components/editor/OnboardingAssistantTaskView";
import { OnboardingPlaceholderView } from "@/components/editor/OnboardingPlaceholderView";
import { createSlashMenuSuggestion, getSlashCommandAction } from "@/components/editor/SlashMenu";
import { useAuth } from "@/context/auth.context";
import { useImageUpload } from "@/hooks/use-image-upload";

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

const yjsServerUrl = import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001/yjs";

export function useDocumentEditor({
  doc,
  onUpdate,
  onTextSelect,
  onAddLink,
}: UseDocumentEditorProps): DocumentEditorHookResult {
  const { user } = useAuth();
  const { uploadImage } = useImageUpload();
  const isLocked = doc.is_locked ?? false;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use refs to persist provider and ydoc across React Strict Mode remounts
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const lastDocIdRef = useRef<string | null>(null);
  
  // Create provider only once per document ID, persist across remounts
  if (!ydocRef.current || !providerRef.current || lastDocIdRef.current !== doc.id) {
    // Clean up old provider if document changed
    if (lastDocIdRef.current && lastDocIdRef.current !== doc.id) {
      console.log(`[DocumentEditor] 🔄 Document changed from ${lastDocIdRef.current} to ${doc.id}`);
      if (providerRef.current) {
        providerRef.current.destroy();
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
      }
    }
    
    console.log(`[DocumentEditor] 📄 Initializing document: ${doc.id}`);
    const yjsState = new Y.Doc();

    // Apply initial state from database
    if (doc.yjs_state) {
      try {
        const bytes = base64ToUint8Array(doc.yjs_state);
        console.log(`[DocumentEditor] 📥 Applying initial Yjs state (${bytes.length} bytes)`);
        Y.applyUpdate(yjsState, bytes);
        console.log(`[DocumentEditor] ✅ Initial state applied`);
      } catch (error) {
        console.error("[DocumentEditor] ❌ Error applying initial Yjs state:", error);
      }
    } else {
      console.log("[DocumentEditor] ⚠️  No initial Yjs state found in document");
    }

    // Use shared WebSocket connection for multiplexing
    console.log(`[DocumentEditor] 🔌 Connecting to WebSocket: ${yjsServerUrl}`);
    const sharedSocket = getSharedWebSocket(yjsServerUrl);

    const hocuspocusProvider = new HocuspocusProvider({
      websocketProvider: sharedSocket,
      name: doc.id,
      document: yjsState,
    });

    // Must call attach() when using shared socket
    hocuspocusProvider.attach();
    console.log(`[DocumentEditor] 🔗 Provider attached for document: ${doc.id}`);

    ydocRef.current = yjsState;
    providerRef.current = hocuspocusProvider;
    lastDocIdRef.current = doc.id;
  } else {
    console.log(`[DocumentEditor] ♻️  Reusing existing provider for document: ${doc.id}`);
  }
  
  const ydoc = ydocRef.current;
  const provider = providerRef.current;

  // Set up provider event listeners (only once)
  useEffect(() => {
    if (!provider || !ydoc) return;

    console.log(`[DocumentEditor] 👂 Listening for provider events on document: ${doc.id}`);

    // Provider event listeners for debugging
    const statusHandler = ({ status }: { status: string }) => {
      console.log(`[DocumentEditor] 📡 Provider status changed: ${status} (doc: ${doc.id})`);
    };
    
    const syncedHandler = ({ synced }: { synced: boolean }) => {
      console.log(`[DocumentEditor] ${synced ? "✅" : "⏳"} Provider synced: ${synced} (doc: ${doc.id})`);
    };
    
    const connectHandler = () => {
      console.log(`[DocumentEditor] 🔌 Provider connected (doc: ${doc.id})`);
    };
    
    const disconnectHandler = () => {
      console.log(`[DocumentEditor] 🔌 Provider disconnected (doc: ${doc.id})`);
    };
    
    const authFailedHandler = ({ reason }: { reason: string }) => {
      console.error(`[DocumentEditor] ❌ Authentication failed (doc: ${doc.id}):`, reason);
    };

    provider.on("status", statusHandler);
    provider.on("synced", syncedHandler);
    provider.on("connect", connectHandler);
    provider.on("disconnect", disconnectHandler);
    provider.on("authenticationFailed", authFailedHandler);

    // Only remove event listeners on unmount, don't destroy provider
    return () => {
      console.log(`[DocumentEditor] 🧹 Removing event listeners for document: ${doc.id}`);
      provider.off("status", statusHandler);
      provider.off("synced", syncedHandler);
      provider.off("connect", connectHandler);
      provider.off("disconnect", disconnectHandler);
      provider.off("authenticationFailed", authFailedHandler);
    };
  }, [provider, ydoc, doc.id]);

  const userInfo = useMemo(() => {
    return user
      ? { name: user.name, color: getUserColor(user.id) }
      : { name: "Anonymous", color: "#808080" };
  }, [user?.id, user?.name, user]);

  const extensions = useMemo(() => {
    const slashMenuSuggestion = createSlashMenuSuggestion(
      fileInputRef as React.RefObject<HTMLInputElement | null>
    );
    
    return getDocumentEditorExtensions({
      textSelection: {
        onSelect: onTextSelect,
      },
      keyboardShortcuts: { onAddLink },
      documentComponent: {
        addNodeView: () => ReactNodeViewRenderer(DocumentComponentComponent),
      },
      codeBlock: {
        addNodeView: () => ReactNodeViewRenderer(CodeBlockComponent),
      },
      onboardingStep: {
        addNodeView: () => ReactNodeViewRenderer(OnboardingStepView),
      },
      onboardingTextPractice: {
        addNodeView: () => ReactNodeViewRenderer(OnboardingTextPracticeView),
      },
      onboardingAssistantTask: {
        addNodeView: () => ReactNodeViewRenderer(OnboardingAssistantTaskView),
      },
      onboardingPlaceholder: {
        addNodeView: () => ReactNodeViewRenderer(OnboardingPlaceholderView),
      },
      slashCommands: {
        suggestion: {
          ...slashMenuSuggestion,
          command: ({ editor, range, props }: any) => {
            getSlashCommandAction(
              props,
              editor,
              range,
              fileInputRef as React.RefObject<HTMLInputElement | null>
            )();
          },
        },
      },
      collaboration: { document: ydoc },
      collaborationCaret: { provider, user: userInfo },
    });
  }, [ydoc, provider, userInfo, onTextSelect, onAddLink]);

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
    [editor],
  );

  return { editor, setContent, provider, ydoc };
}

function createImageDropHandler(uploadImage: (file: File) => Promise<string>) {
  return function (view: EditorView, event: DragEvent, _slice: Slice, moved: boolean): boolean {
    if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      const filesize = (file.size / 1024 / 1024).toFixed(4);

      const validImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
      if (validImageTypes.includes(file.type) && parseFloat(filesize) < 10) {
        // Check image dimensions
        const _URL = window.URL || window.webkitURL;
        const img = new Image();
        img.src = _URL.createObjectURL(file);
        img.onload = function () {
          // Allow images up to 5000px in width/height
          if (img.width > 5000 || img.height > 5000) {
            window.alert("Your images need to be less than 5000 pixels in height and width.");
            _URL.revokeObjectURL(img.src);
            return;
          }

          uploadImage(file)
            .then(function (url) {
              const preloadImg = new Image();
              preloadImg.src = url;
              preloadImg.onload = function () {
                const { schema } = view.state;
                const coordinates = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });
                if (coordinates) {
                  const node = schema.nodes.image.create({ src: url });
                  const transaction = view.state.tr.insert(coordinates.pos, node);
                  view.dispatch(transaction);
                }
              };
              preloadImg.onerror = function () {
                window.alert("There was a problem loading your image, please try again.");
              };
            })
            .catch(function (error) {
              console.error("Failed to upload image:", error);
              window.alert("There was a problem uploading your image, please try again.");
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
          "Images need to be in jpg, png, webp, or gif format and less than 10MB in size.",
        );
        return true; // Handled (even if invalid)
      }
    }
    return false; // Not handled, use default behaviour
  };
}
