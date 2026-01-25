import type { QueryResultType } from "@rocicorp/zero";

import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";
import { toast } from "sonner";

import {
  documentEditorAtom,
  pendingChangeStatusAtom,
  pendingEditorChangeAtom,
  titleEditorAtom,
} from "@/atoms/editor";
import { SelectedContentProvider, useSelectedContent } from "@/context/selected-content.context";
import { isDockedAtom, isOpenAtom } from "@/hooks/use-floating-assistant";
import { useDocumentEditor } from "@/lib/editor/document-editor";
import { useTitleEditor } from "@/lib/editor/title-editor";
import { useZero } from "@/services/zero";
import { applyContentChanges } from "@/utils/document-changes";
import { applyTitleChange } from "@/utils/title-changes";

import { BubbleMenu } from "./editor/BubbleMenu";
import { CoverImageEditor } from "./editor/CoverImageEditor";
import { DocumentMetadataTabs } from "./editor/DocumentMetadataTabs";
import { EditorToolbar } from "./editor/EditorToolbar";
import { LinkPopover } from "./editor/LinkPopover";
import { Surface } from "./layout/Surface";

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

function EditorContainer({ doc }: Props) {
  const z = useZero();
  const [title, setTitle] = useState(doc.title || "");
  const { setFocusedContent } = useSelectedContent();
  const openLinkDialogRef = useRef<(() => void) | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLocked = doc.is_locked ?? false;

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "editor-panel-group",
    storage: localStorage,
  });

  const setDocumentEditor = useSetAtom(documentEditorAtom);
  const setTitleEditor = useSetAtom(titleEditorAtom);
  const [pendingChange, setPendingChange] = useAtom(pendingEditorChangeAtom);
  const setPendingChangeStatus = useSetAtom(pendingChangeStatusAtom);
  const isDocked = useAtomValue(isDockedAtom);
  const isAssistantOpen = useAtomValue(isOpenAtom);

  // When assistant is undocked and open, shift content left to avoid overlap
  // Only apply on screens smaller than 2xl (1536px) to avoid unnecessary adjustments on ultrawide monitors
  const shouldShiftContent = !isDocked && isAssistantOpen;

  const handleTitleUpdate = (newTitle: string) => {
    const finalTitle = newTitle.trim();
    setTitle(finalTitle);
  };

  const handleOpenLinkDialog = useCallback(() => {
    if (openLinkDialogRef.current) {
      openLinkDialogRef.current();
    }
  }, []);

  const registerLinkDialogCallback = useCallback((callback: () => void) => {
    openLinkDialogRef.current = callback;
  }, []);

  const selectText = (selectedText: string) => {
    setFocusedContent(selectedText);
  };

  const contentEditor = useDocumentEditor({
    doc,
    onTextSelect: selectText,
    onAddLink: handleOpenLinkDialog,
  });

  const titleEditor = useTitleEditor({
    initialTitle: doc.title || "",
    onUpdate: handleTitleUpdate,
    onEnter: () => {
      if (contentEditor.editor) {
        contentEditor.editor.commands.focus(0);
      }
    },
    editable: !isLocked,
  });

  useEffect(() => {
    setDocumentEditor(contentEditor.editor);
    return () => {
      setDocumentEditor(null);
    };
  }, [contentEditor.editor, setDocumentEditor]);

  useEffect(() => {
    setTitleEditor(titleEditor.editor);
    return () => {
      setTitleEditor(null);
    };
  }, [titleEditor.editor, setTitleEditor]);

  useEffect(() => {
    if (!titleEditor.editor) return;

    const handleBlur = () => {
      const finalTitle = title.trim();
      z.mutate(
        mutators.document.update({
          documentId: doc.id,
          title: finalTitle,
          organizationId: doc.organization_id,
        }),
      );
    };

    const editorElement = titleEditor.editor.view.dom;
    editorElement.addEventListener("blur", handleBlur);

    return () => {
      editorElement.removeEventListener("blur", handleBlur);
    };
  }, [titleEditor.editor, title, z, doc.id, doc.organization_id]);

  useEffect(() => {
    if (!pendingChange) return;
    if (!contentEditor.editor && !titleEditor.editor) return;

    if (pendingChange.documentId !== doc.id) return;

    const applyPendingChange = async () => {
      setPendingChangeStatus("applying");
      toast.info("Applying changes...");

      try {
        let contentSuccess = true;
        let titleSuccess = true;

        if (pendingChange.title && titleEditor.editor) {
          const titleResult = await applyTitleChange(
            titleEditor.editor,
            pendingChange.title,
            doc.id,
            pendingChange.organizationId,
            z,
          );
          titleSuccess = titleResult.success;
          if (!titleSuccess) {
            console.error("Failed to apply title change:", titleResult.error);
          }
        }

        if (pendingChange.replace && contentEditor.editor) {
          const result = await applyContentChanges(
            contentEditor.editor,
            [
              {
                search: pendingChange.search,
                replace: pendingChange.replace,
              },
            ],
            pendingChange.organizationId,
          );

          contentSuccess = result.success;
          if (result.success) {
            if (result.usedLLMFallback) {
              console.info("✨ LLM-assisted replacement was used for this change");
            }
          } else {
            console.error("Failed to apply content changes:", result.error);
          }
        }

        if (contentSuccess && titleSuccess) {
          setPendingChangeStatus("applied");
          toast.success("Changes applied successfully");
        } else {
          setPendingChangeStatus("failed");
          toast.error("Failed to apply changes");
        }
      } catch (error) {
        setPendingChangeStatus("failed");
        console.error("Failed to apply pending change:", error);
        toast.error("Failed to apply changes");
      } finally {
        setTimeout(() => {
          setPendingChange(null);
          setPendingChangeStatus(null);
        }, 1000);
      }
    };

    const timeoutId = setTimeout(() => {
      applyPendingChange();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    contentEditor.editor,
    titleEditor.editor,
    doc.id,
    pendingChange,
    setPendingChange,
    setPendingChangeStatus,
    z,
  ]);

  if (!contentEditor.editor || !titleEditor.editor) {
    return null;
  }

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden">
        <Group
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel minSize="400px" className="flex flex-col grow relative">
            <EditorToolbar
              editor={contentEditor.editor}
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
              className={clsx(
                "flex py-8 overflow-y-auto grow flex-col scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white relative transition-[padding] duration-500 ease-in-out",
                shouldShiftContent ? "max-2xl:pl-4 max-2xl:pr-[160px]" : "px-4",
              )}
            >
              <div className="mx-auto w-full h-full max-w-[65ch] pb-8 flex flex-col">
                <CoverImageEditor
                  documentId={doc.id}
                  organizationId={doc.organization_id}
                  coverImage={doc.cover_image}
                />
                <EditorContent
                  editor={titleEditor.editor}
                  aria-label="Document title"
                  className="mb-6"
                />
                <DocumentMetadataTabs
                  doc={doc}
                  initialFields={(doc.custom_fields as Record<string, string | number>) || {}}
                />
                <LinkPopover
                  editor={contentEditor.editor}
                  onOpenLinkDialog={registerLinkDialogCallback}
                />
                <BubbleMenu editor={contentEditor.editor} onAddLink={handleOpenLinkDialog} />
                <EditorContent
                  aria-label="Document content"
                  editor={contentEditor.editor}
                  className="block grow"
                />
              </div>
            </div>
          </Panel>
        </Group>
      </Surface>
    </div>
  );
}
