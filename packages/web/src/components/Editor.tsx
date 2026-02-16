import type { QueryResultType } from "@rocicorp/zero";

import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { editorCache, pendingChangeStatusAtom, pendingEditorChangeAtom } from "@/atoms/editor";
import {
  isFloatingAssistantDockedAtom as isDockedAtom,
  isFloatingAssistantOpenAtom as isOpenAtom,
} from "@/atoms/workspace-settings";
import { useAuth } from "@/context/auth.context";
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
  return (
    <EditorContainer
      doc={doc}
      organizationId={organizationId}
      organizationSlug={organizationSlug}
    />
  );
}

function EditorContainer({ doc, organizationId, organizationSlug }: Props) {
  const z = useZero();
  const { user } = useAuth();
  const isLocked = doc.is_locked ?? false;

  const [pendingChange, setPendingChange] = useAtom(pendingEditorChangeAtom);
  const setPendingChangeStatus = useSetAtom(pendingChangeStatusAtom);
  const isDocked = useAtomValue(isDockedAtom);
  const isAssistantOpen = useAtomValue(isOpenAtom);

  // Track initialization state and last synced title
  const initializedRef = useRef(false);
  const lastSyncedRef = useRef<{ id: string; title: string } | null>(null);

  // When assistant is undocked and open, shift content left to avoid overlap
  const shouldShiftContent = !isDocked && isAssistantOpen;

  // Get or create cached editors synchronously during render
  // This ensures editors are available immediately on first render
  const cached = user
    ? editorCache.getOrCreate(doc.id, user.id, user.name, doc.yjs_state, isLocked, doc.title || "")
    : null;

  // Sync title during render when document changes (no useEffect needed)
  // This is acceptable for imperative APIs like TipTap outside React's render cycle
  if (cached) {
    const needsSync =
      lastSyncedRef.current?.id !== doc.id || lastSyncedRef.current?.title !== (doc.title || "");

    if (needsSync && !cached.titleEditor.isFocused) {
      const expectedTitle = doc.title || "";
      cached.titleEditor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: expectedTitle ? [{ type: "text", text: expectedTitle }] : [],
          },
        ],
      });
      lastSyncedRef.current = { id: doc.id, title: expectedTitle };
    }
  }

  // Track initialization - ensures we only run side effects once per mount
  useEffect(() => {
    if (!cached) return;
    if (initializedRef.current) return;

    initializedRef.current = true;

    // Touch the cache to update LRU timestamp
    editorCache.touch(doc.id);

    return () => {
      initializedRef.current = false;
    };
  }, [cached, doc.id]);

  // Handle title blur - save to database
  useEffect(() => {
    if (!cached) return;

    const handleBlur = () => {
      const finalTitle = cached.titleEditor.getText().trim();
      if (finalTitle !== doc.title) {
        z.mutate(
          mutators.document.update({
            documentId: doc.id,
            title: finalTitle,
            organizationId: doc.organization_id,
          }),
        );
      }
    };

    // Add blur listener to title editor
    const titleDom = cached.titleEditor.view.dom as HTMLElement;
    titleDom.addEventListener("blur", handleBlur, true);

    return () => {
      titleDom.removeEventListener("blur", handleBlur, true);
    };
  }, [cached, doc.id, doc.title, doc.organization_id, z]);

  // Apply pending changes
  useEffect(() => {
    if (!pendingChange) return;
    if (pendingChange.documentId !== doc.id) return;
    if (!cached) return;

    const applyPendingChange = async () => {
      setPendingChangeStatus("applying");
      toast.info("Applying changes...");

      try {
        let contentSuccess = true;
        let titleSuccess = true;

        if (pendingChange.title) {
          const titleResult = await applyTitleChange(
            cached.titleEditor,
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

        if (pendingChange.replace) {
          const result = await applyContentChanges(
            cached.contentEditor,
            [
              {
                selectionWithEllipsis: pendingChange.selectionWithEllipsis,
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
  }, [cached, doc.id, pendingChange, setPendingChange, setPendingChangeStatus, z]);

  // Render EditorView with cached editors
  // If no cached editors yet (waiting for user), return null
  if (!cached) {
    return null;
  }

  return (
    <EditorView
      doc={doc}
      contentEditor={cached.contentEditor}
      titleEditor={cached.titleEditor}
      isLocked={isLocked}
      shouldShiftContent={shouldShiftContent}
      organizationId={organizationId}
      organizationSlug={organizationSlug}
    />
  );
}
