import type { QueryResultType } from "@rocicorp/zero";

import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
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

import { EditorView } from "./editor/EditorView";

type Props = {
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  organizationId: string;
  organizationSlug: string;
};

export function Editor({ doc, organizationId, organizationSlug }: Props) {
  return <EditorContainer doc={doc} organizationId={organizationId} organizationSlug={organizationSlug} />;
}

function EditorContainer({ doc, organizationId, organizationSlug }: Props) {
  const z = useZero();
  const [title, setTitle] = useState(doc.title || "");
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
    <EditorView
      doc={doc}
      contentEditor={contentEditor.editor}
      titleEditor={titleEditor.editor}
      isLocked={isLocked}
      shouldShiftContent={shouldShiftContent}
      organizationId={organizationId}
      organizationSlug={organizationSlug}
    />
  );
}
