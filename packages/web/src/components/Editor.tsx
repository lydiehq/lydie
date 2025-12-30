import { useAuthenticatedApi } from "@/services/api";
import { EditorContent } from "@tiptap/react";
import { useZero } from "@/services/zero";
import {
  Panel,
  PanelGroup,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { EditorSidebar } from "./editor/EditorSidebar";
import { useRef, useState, useCallback, useEffect } from "react";
import { EditorToolbar } from "./editor/EditorToolbar";
import { PanelResizer } from "./panels/PanelResizer";
import { BottomBar } from "./editor/BottomBar";
import { useTitleEditor } from "@/utils/editor";
import {
  SelectedContentProvider,
  useSelectedContent,
} from "@/context/selected-content.context";
import { LinkPopover } from "./editor/LinkPopover";
import { BubbleMenu } from "./editor/BubbleMenu";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { Surface } from "./layout/Surface";
import type { DocumentChatRef } from "./editor/DocumentChat";
import { mutators } from "@lydie/zero/mutators";
import { CustomFieldsEditor } from "./editor/CustomFieldsEditor";
import { useAuth } from "@/context/auth.context";
import { useCollaborativeEditor } from "@/utils/collaborative-editor";

type Props = {
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
};

export function Editor({ doc }: Props) {
  return (
    <SelectedContentProvider>
      <EditorContainer doc={doc} />
    </SelectedContentProvider>
  );
}

const COLLAPSED_SIZE = 3.5;

function EditorContainer({ doc }: Props) {
  const api = useAuthenticatedApi();
  const z = useZero();
  const { session } = useAuth();
  const [sidebarSize, setSidebarSize] = useState(25);
  const [title, setTitle] = useState(doc.title || "");
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const { setFocusedContent } = useSelectedContent();
  const openLinkDialogRef = useRef<(() => void) | null>(null);

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };

  const handleTitleUpdate = (newTitle: string) => {
    const finalTitle = newTitle.trim();
    setTitle(finalTitle);
  };

  const handleContentUpdate = () => {
    // Content sync is now handled by Yjs, no need for auto-save
    // We keep this callback for potential future use
  };

  const handleManualSave = () => {
    if (!contentEditor.editor) return;
    // Manual save now only updates the title and marks index as outdated
    // Content is auto-synced by Yjs
    z.mutate(
      mutators.document.update({
        documentId: doc.id,
        title: title || "",
        jsonContent: contentEditor.editor.getJSON(),
        indexStatus: "outdated",
        organizationId: doc.organization_id,
      })
    );
  };

  const handleOpenLinkDialog = useCallback(() => {
    if (openLinkDialogRef.current) {
      openLinkDialogRef.current();
    }
  }, []);

  const registerLinkDialogCallback = useCallback((callback: () => void) => {
    openLinkDialogRef.current = callback;
  }, []);

  const sidebarRef = useRef<DocumentChatRef>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const selectText = (selectedText: string) => {
    setFocusedContent(selectedText);
    if (sidebarRef.current) {
      sidebarRef.current.focus();
    }
  };

  const contentEditor = useCollaborativeEditor({
    initialContent: doc?.json_content ? doc.json_content : null,
    documentId: doc.id,
    onUpdate: handleContentUpdate,
    getApiClient: api.createClient,
    onSave: handleManualSave,
    onTextSelect: selectText,
    onAddLink: handleOpenLinkDialog,
    currentUser: session?.user
      ? {
          id: session.user.id,
          name: session.user.name,
        }
      : undefined,
    yjsServerUrl:
      import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001",
  });

  const titleEditor = useTitleEditor({
    initialTitle: title,
    onUpdate: handleTitleUpdate,
    onEnter: () => {
      // Focus the content editor when Enter is pressed in title
      if (contentEditor.editor) {
        contentEditor.editor.commands.focus();
      }
    },
  });

  // Handle blur event for title editor
  useEffect(() => {
    if (!titleEditor.editor) return;

    const handleBlur = () => {
      const finalTitle = title.trim();
      z.mutate(
        mutators.document.update({
          documentId: doc.id,
          title: finalTitle,
          indexStatus: "outdated",
          organizationId: doc.organization_id,
        })
      );
    };

    const editorElement = titleEditor.editor.view.dom;
    editorElement.addEventListener("blur", handleBlur);

    return () => {
      editorElement.removeEventListener("blur", handleBlur);
    };
  }, [titleEditor.editor, title, z, doc.id, doc.organization_id]);

  // Periodic sync of Yjs document content to Zero/PostgreSQL
  // This ensures embeddings and integrations stay in sync
  useEffect(() => {
    if (!contentEditor.editor || !contentEditor.provider) return;

    let syncInterval: NodeJS.Timeout | null = null;

    // Only sync when provider is synced (connected and ready)
    // Don't sync if editor is empty (might not be initialized yet)
    const checkAndSync = () => {
      if (
        contentEditor.provider?.synced &&
        contentEditor.editor &&
        !contentEditor.editor.isEmpty
      ) {
        const jsonContent = contentEditor.editor.getJSON();
        z.mutate(
          mutators.document.update({
            documentId: doc.id,
            jsonContent: jsonContent,
            indexStatus: "outdated",
            organizationId: doc.organization_id,
          })
        );
      }
    };

    // Start periodic sync after a delay to ensure initialization happens first
    const startSyncTimeout = setTimeout(() => {
      // Sync every 30 seconds (matching server-side persistence debounce)
      syncInterval = setInterval(checkAndSync, 30000);
    }, 5000); // Wait 5 seconds before starting periodic sync

    // Also sync when provider becomes synced (but only if not empty)
    const handleSync = () => {
      if (contentEditor.provider?.synced) {
        // Wait a bit before syncing to allow initialization
        setTimeout(checkAndSync, 1000);
      }
    };

    contentEditor.provider.on("synced", handleSync);

    return () => {
      clearTimeout(startSyncTimeout);
      if (syncInterval) clearInterval(syncInterval);
      contentEditor.provider?.off("synced", handleSync);
    };
  }, [
    contentEditor.editor,
    contentEditor.provider,
    z,
    doc.id,
    doc.organization_id,
  ]);

  if (!contentEditor.editor || !titleEditor.editor) {
    return null;
  }

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden">
        <PanelGroup autoSaveId="editor-panel-group" direction="horizontal">
          <Panel
            minSize={20}
            defaultSize={75}
            className="flex flex-col grow relative"
          >
            <EditorToolbar
              editor={contentEditor.editor}
              saveDocument={handleManualSave}
              doc={doc}
              onAddLink={handleOpenLinkDialog}
            />
            <div
              ref={scrollContainerRef}
              className="flex py-8 overflow-y-auto grow flex-col scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white relative px-4"
            >
              <div className="mx-auto w-full h-full max-w-[65ch]">
                <div className="mb-6">
                  <EditorContent
                    editor={titleEditor.editor}
                    aria-label="Document title"
                  />
                </div>
                <div className="mb-6">
                  <CustomFieldsEditor
                    documentId={doc.id}
                    organizationId={doc.organization_id}
                    initialFields={
                      (doc.custom_fields as Record<string, string | number>) ||
                      {}
                    }
                  />
                </div>
                <LinkPopover
                  editor={contentEditor.editor}
                  onOpenLinkDialog={registerLinkDialogCallback}
                />
                <BubbleMenu
                  editor={contentEditor.editor}
                  onAddLink={handleOpenLinkDialog}
                />
                <EditorContent
                  aria-label="Document content"
                  editor={contentEditor.editor}
                  className="min-h-full size-full pb-12 block"
                />
              </div>
            </div>
            <BottomBar
              editor={contentEditor.editor}
              lastSaved={new Date(doc.updated_at)}
            />
          </Panel>
          <PanelResizer />
          <Panel
            ref={sidebarPanelRef}
            id="editor-sidebar"
            collapsible={true}
            collapsedSize={COLLAPSED_SIZE}
            minSize={12}
            defaultSize={25}
            onResize={setSidebarSize}
          >
            <EditorSidebar
              ref={sidebarRef}
              contentEditor={contentEditor}
              doc={doc}
              isCollapsed={sidebarSize === COLLAPSED_SIZE}
              onToggle={toggleSidebar}
            />
          </Panel>
        </PanelGroup>
      </Surface>
    </div>
  );
}
