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
import { useCollaborativeEditor } from "@/utils/collaborative-editor";
import {
  SelectedContentProvider,
  useSelectedContent,
} from "@/context/selected-content.context";
import { LinkPopover } from "./editor/LinkPopover";
import { BubbleMenu } from "./editor/BubbleMenu";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { Surface } from "./layout/Surface";
import { Input } from "react-aria-components";
import type { DocumentChatRef } from "./editor/DocumentChat";
import { mutators } from "@lydie/zero/mutators";
import { useAuth } from "@/context/auth.context";
import { PresenceIndicators } from "./editor/PresenceIndicators";

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
  const [title, setTitle] = useState(doc.title || "Untitled document");
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const { setFocusedContent } = useSelectedContent();
  const openLinkDialogRef = useRef<(() => void) | null>(null);

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

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Blur the title input to trigger save
      e.currentTarget.blur();
      // Focus the content editor
      if (contentEditor.editor) {
        contentEditor.editor.commands.focus();
      }
    }
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
        title: title || "Untitled document",
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
      import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:1234",
  });

  // Cleanup Yjs provider on unmount
  useEffect(() => {
    return () => {
      if (contentEditor.provider) {
        contentEditor.provider.destroy();
      }
      if (contentEditor.ydoc) {
        contentEditor.ydoc.destroy();
      }
    };
  }, [contentEditor.provider, contentEditor.ydoc]);

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
            'input[type="text"]'
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
            <div className="py-1.5 flex items-start gap-4 h-10 shrink-0 border-b border-black/8">
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
                  size={title.length || 1}
                  placeholder="Untitled document"
                  className="font-medium text-gray-950 border-none outline-none focus:ring-0 w-auto max-w-full truncate px-2 pt-0.5"
                  style={{
                    width: `${Math.max(
                      Math.min(title.length || 20, 34),
                      20
                    )}ch`,
                  }}
                />
              </div>
              <div className="flex-1 flex items-center justify-end px-4">
                <PresenceIndicators provider={contentEditor.provider} />
              </div>
            </div>
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
