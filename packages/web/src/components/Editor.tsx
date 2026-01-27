import type { QueryResultType } from "@rocicorp/zero";

import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  documentEditorAtom,
  pendingChangeStatusAtom,
  pendingEditorChangeAtom,
  titleEditorAtom,
} from "@/atoms/editor";
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

type Props = {
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
};

export function Editor({ doc }: Props) {
  return <EditorContainer doc={doc} />;
}

function EditorContainer({ doc }: Props) {
  const z = useZero();
  const [title, setTitle] = useState(doc.title || "");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLocked = doc.is_locked ?? false;

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

  const contentEditor = useDocumentEditor({
    doc,
    onCreate: setDocumentEditor,
    onDestroy: () => {
      setDocumentEditor(null);
    },
  });

  const titleEditor = useTitleEditor({
    initialTitle: doc.title || "",
    onUpdate: handleTitleUpdate,
    onEnter: () => {
      if (contentEditor.editor) {
        contentEditor.editor.commands.focus(0);
      }
    },
    onBlur: () => {
      const finalTitle = title.trim();
      z.mutate(
        mutators.document.update({
          documentId: doc.id,
          title: finalTitle,
          organizationId: doc.organization_id,
        }),
      );
    },
    onCreate: setTitleEditor,
    onDestroy: () => {
      setTitleEditor(null);
    },
    editable: !isLocked,
  });

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
    <div className="overflow-hidden flex flex-col grow relative size-full">
      <EditorToolbar editor={contentEditor.editor} doc={doc} />
      {isLocked && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
          This page is managed by an integration and cannot be edited.
        </div>
      )}
      <div
        ref={scrollContainerRef}
        className="flex flex-row grow overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white "
      >
        <div className="flex mx-auto grow max-w-[65ch] px-4 flex-col pt-12">
          <CoverImageEditor
            documentId={doc.id}
            organizationId={doc.organization_id}
            coverImage={doc.cover_image}
          />
          <EditorContent editor={titleEditor.editor} aria-label="Document title" className="my-2" />
          <DocumentMetadataTabs
            doc={doc}
            initialFields={(doc.custom_fields as Record<string, string | number>) || {}}
          />
          <LinkPopover editor={contentEditor.editor} />
          <BubbleMenu editor={contentEditor.editor} />
          <EditorContent
            aria-label="Document content"
            editor={contentEditor.editor}
            className="block grow"
          />
        </div>
        {/* Handles shifting content left when assistant is undocked and open */}
        <div
          className={clsx(
            "shrink-0 transition-[width] duration-500 ease-in-out bg-",
            shouldShiftContent ? "max-2xl:w-[170px]" : "w-0",
          )}
        />
      </div>
    </div>
  );
}
