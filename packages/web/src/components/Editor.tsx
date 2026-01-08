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
import { useDocumentEditor } from "@/lib/editor/document-editor";
import { ChildPages } from "./editor/ChildPages";
import { DocumentIcon } from "@/icons";
import { Input } from "react-aria-components";

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
  const z = useZero();
  const [sidebarSize, setSidebarSize] = useState(25);
  const [title, setTitle] = useState(doc.title || "Untitled document");
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const { setFocusedContent } = useSelectedContent();
  const openLinkDialogRef = useRef<(() => void) | null>(null);
  const sidebarRef = useRef<DocumentChatRef>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLocked = doc.is_locked ?? false;

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
  };

  const handleTitleBlur = () => {
    z.mutate(
      mutators.document.update({
        documentId: doc.id,
        title: title || "Untitled document",
        indexStatus: "outdated",
        organizationId: doc.organization_id,
      })
    );
  };

  const contentEditorRef = useRef<ReturnType<typeof useDocumentEditor> | null>(
    null
  );

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Blur the title input to trigger save
      e.currentTarget.blur();
      // Focus the content editor
      if (contentEditorRef.current?.editor) {
        contentEditorRef.current.editor.commands.focus();
      }
    }
  };

  const handleManualSave = useCallback(() => {
    z.mutate(
      mutators.document.update({
        documentId: doc.id,
        title: title || "Untitled document",
        indexStatus: "outdated",
        organizationId: doc.organization_id,
      })
    );
  }, [z, doc.id, doc.organization_id, title]);

  const handleOpenLinkDialog = useCallback(() => {
    if (openLinkDialogRef.current) {
      openLinkDialogRef.current();
    }
  }, []);

  const registerLinkDialogCallback = useCallback((callback: () => void) => {
    openLinkDialogRef.current = callback;
  }, []);

  const selectText = useCallback(
    (selectedText: string) => {
      setFocusedContent(selectedText);
      if (sidebarRef.current) {
        sidebarRef.current.focus();
      }
    },
    [setFocusedContent]
  );

  const contentEditor = useDocumentEditor({
    doc,
    onSave: handleManualSave,
    onTextSelect: selectText,
    onAddLink: handleOpenLinkDialog,
  });

  contentEditorRef.current = contentEditor;

  // Extract a good title suggestion from the document content
  const extractTitleSuggestion = () => {
    if (!contentEditor.editor) return null;

    const json = contentEditor.editor.getJSON();
    if (!json.content) return null;

    // First, try to find an h1 heading
    for (const node of json.content) {
      if (node.type === "heading" && node.attrs?.level === 1) {
        const text = node.content
          ?.map((n: any) => n.text || "")
          .join("")
          .trim();

        // Only suggest if it's not too long (not a full sentence)
        if (text && text.length > 0 && text.length <= 100) {
          return text;
        }
      }
    }

    // If no h1, try to get initial text from first paragraph
    for (const node of json.content) {
      if (node.type === "paragraph" && node.content) {
        const text = node.content
          ?.map((n: any) => n.text || "")
          .join("")
          .trim();

        // Only suggest if it's short enough (not a full sentence)
        // Stop at first period, comma, or newline, or limit to ~50 chars
        if (text) {
          const truncated = text
            .split(/[.,\n]/)[0]
            .trim()
            .substring(0, 50);

          if (truncated.length > 0 && truncated.length < text.length) {
            return truncated;
          } else if (truncated.length > 0 && truncated.length <= 50) {
            return truncated;
          }
        }
      }
    }

    return null;
  };

  const handleTitleFocus = () => {
    // Only suggest a title if current title is "Untitled document" or empty
    const isUntitled = !title || title === "Untitled document";

    if (isUntitled) {
      const suggestion = extractTitleSuggestion();
      if (suggestion) {
        setTitle(suggestion);
        // Select the text so user can easily replace it if they don't like it
        setTimeout(() => {
          const input = document.querySelector(
            'input[type="text"][name="document-title"]'
          ) as HTMLInputElement;
          if (input) {
            input.select();
          }
        }, 0);
      }
    }
  };

  if (!contentEditor.editor) {
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
            <div className="flex gap-x-2 px-3 py-1.5 border-b border-black/8 items-center">
              <DocumentIcon className="size-4 text-gray-400" />
              <div className="flex max-w-[40ch] items-center">
                <Input
                  type="text"
                  value={title}
                  name="document-title"
                  aria-label="Document title"
                  onChange={handleTitleChange}
                  onFocus={handleTitleFocus}
                  onBlur={handleTitleBlur}
                  onKeyDown={handleTitleKeyDown}
                  placeholder="Untitled document"
                  disabled={isLocked}
                  className="font-medium text-gray-950 border-none outline-none focus:ring-0 w-auto max-w-full truncate px-2 pt-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    width: `${Math.max(
                      Math.min(title.length || 20, 34),
                      20
                    )}ch`,
                  }}
                />
              </div>
            </div>
            <EditorToolbar
              editor={contentEditor.editor}
              saveDocument={handleManualSave}
              doc={doc}
              onAddLink={handleOpenLinkDialog}
            />
            {isLocked && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                This page is managed by an integration and cannot be edited.
              </div>
            )}
            <div
              ref={scrollContainerRef}
              className="flex py-8 overflow-y-auto grow flex-col scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white relative px-4"
            >
              <div className="mx-auto w-full h-full max-w-[65ch] pb-8 flex flex-col">
                {/* <EditorContent
                  editor={titleEditor.editor}
                  aria-label="Document title"
                  className="mb-6"
                /> */}
                {/* <CustomFieldsEditor
                  documentId={doc.id}
                  organizationId={doc.organization_id}
                  initialFields={
                    (doc.custom_fields as Record<string, string | number>) || {}
                  }
                /> */}
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
                  className="block grow"
                />
                <ChildPages
                  documentId={doc.id}
                  organizationId={doc.organization_id}
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
