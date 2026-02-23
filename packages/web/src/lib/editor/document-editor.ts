import { HocuspocusProvider } from "@hocuspocus/provider";
import { COLORS } from "@lydie/core/colors";
import { getDocumentEditorExtensions } from "@lydie/editor";
import { renderCollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret";
import type { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import type { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { Editor, useEditor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { createElement, useCallback, useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";

import { CodeBlockComponent } from "@/components/CodeBlockComponent";
import { DocumentComponent as DocumentComponentComponent } from "@/components/DocumentComponent";
import { CollectionViewBlockComponent } from "@/components/editor/CollectionViewBlockComponent";
import { OnboardingAssistantTaskView } from "@/components/editor/onboarding/OnboardingAssistantTaskView";
import { OnboardingTextPracticeView } from "@/components/editor/onboarding/OnboardingTextPracticeView";
import { createSlashMenuSuggestion, getSlashCommandAction } from "@/components/editor/SlashMenu";
import { PlaceholderComponent } from "@/components/PlaceholderComponent";
import { useAuth } from "@/context/auth.context";
import { useImageUpload } from "@/hooks/use-image-upload";
import { useZero } from "@/services/zero";

import { documentConnectionManager } from "./document-connection-manager";

export type DocumentEditorHookResult = {
  editor: Editor | null;
  setContent: (content: string) => void;
  provider: HocuspocusProvider | null;
  ydoc: Y.Doc | null;
};

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = COLORS[Math.abs(hash) % COLORS.length];
  return color.value;
}

type UseDocumentEditorProps = {
  onUpdate?: () => void;
  onSave?: () => void;
  onCreate?: (editor: Editor) => void;
  onDestroy?: () => void;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  organizationSlug: string;
};

export function useDocumentEditor({
  doc,
  onUpdate,
  onCreate,
  onDestroy,
  organizationSlug,
}: UseDocumentEditorProps): DocumentEditorHookResult {
  const { user } = useAuth();
  const { uploadImage } = useImageUpload();
  const z = useZero();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track if component is mounted
  const isMountedRef = useRef(true);

  // Get or create connection from the global manager - updates when doc.id changes
  const connection = useMemo(() => {
    return documentConnectionManager.getConnection(doc.id, doc.yjs_state);
  }, [doc.id, doc.yjs_state]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const ydoc = connection.ydoc;
  const provider = connection.provider;

  const userInfo = useMemo(() => {
    return user
      ? { name: user.name, color: getUserColor(user.id) }
      : { name: "Anonymous", color: "#808080" };
  }, [user]);

  const slashMenuSuggestion = createSlashMenuSuggestion(
    doc.organization_id,
    z,
    fileInputRef as React.RefObject<HTMLInputElement | null>,
  );

  const editor = useEditor(
    {
      autofocus: true,
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
            const orgId = doc.organization_id;
            const orgSlug = organizationSlug;
            return ReactNodeViewRenderer((nodeViewProps) =>
              createElement(CollectionViewBlockComponent, {
                ...nodeViewProps,
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
        slashCommands: {
          suggestion: {
            ...slashMenuSuggestion,
            command: ({ editor, range, props }: any) => {
              getSlashCommandAction(
                props,
                editor,
                range,
                fileInputRef as React.RefObject<HTMLInputElement | null>,
              )();
            },
          },
        },
        collaboration: { document: ydoc },
        collaborationCaret: { provider, user: userInfo, render: renderCollaborationCaret },
      }),
      editorProps: {
        attributes: {
          class: "size-full outline-none editor-content pb-8",
          "data-doc-content": "",
        },
        handleDrop: createImageDropHandler(uploadImage),
      },
      onUpdate,
      onCreate: ({ editor }) => {
        onCreate?.(editor);
      },
      onDestroy: () => {
        onDestroy?.();
      },
    },
    [ydoc, provider, userInfo, doc.id],
  );

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
        const _URL = window.URL || window.webkitURL;
        const img = new Image();
        img.src = _URL.createObjectURL(file);

        // Calculate drop position synchronously before any async operations
        const coordinates = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        const dropPos = coordinates?.pos;

        img.onload = function () {
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
                if (dropPos !== undefined) {
                  const node = schema.nodes.image.create({ src: url });
                  const transaction = view.state.tr.insert(dropPos, node);
                  view.dispatch(transaction);
                }
              };
              preloadImg.onerror = function () {
                window.alert("There was a problem loading your image, please try again.");
              };
            })
            .catch(function () {
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

        return true;
      } else {
        window.alert(
          "Images need to be in jpg, png, webp, or gif format and less than 10MB in size.",
        );
        return true;
      }
    }
    return false;
  };
}
