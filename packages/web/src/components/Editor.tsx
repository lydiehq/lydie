import { useAuthenticatedApi } from "@/services/api";
import { EditorContent } from "@tiptap/react";
import { useZero } from "@/services/zero";
import {
  Panel,
  PanelGroup,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { EditorSidebar } from "./editor/EditorSidebar";
import { useRef, useState, useCallback } from "react";
import { EditorToolbar } from "./editor/EditorToolbar";
import { PanelResizer } from "./panels/PanelResizer";
import { BottomBar } from "./editor/BottomBar";
import { useContentEditor, useTitleEditor } from "@/utils/editor";
import { useAutoSave } from "@/hooks/use-auto-save";
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
import { useEffect } from "react";

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
  const [sidebarSize, setSidebarSize] = useState(25);
  const [title, setTitle] = useState(doc.title || "");
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const { setFocusedContent } = useSelectedContent();
  const openLinkDialogRef = useRef<(() => void) | null>(null);

  const { saveDocument } = useAutoSave({
    documentId: doc.id,
    debounceMs: 500,
  });

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
    if (!contentEditor.editor) return;
    saveDocument({
      json_content: contentEditor.editor.getJSON(),
    });
  };

  const handleManualSave = () => {
    if (!contentEditor.editor) return;
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

  const contentEditor = useContentEditor({
    initialContent: doc?.json_content ? doc.json_content : null,
    documentId: doc.id,
    onUpdate: handleContentUpdate,
    getApiClient: api.createClient,
    onSave: handleManualSave,
    onTextSelect: selectText,
    onAddLink: handleOpenLinkDialog,
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
