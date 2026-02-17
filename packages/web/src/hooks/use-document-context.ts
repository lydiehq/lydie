import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useCallback, useMemo, useState } from "react";

import type { ChatContextItem } from "@/components/chat/ChatContextList";
import { useOrganization } from "@/context/organization.context";

interface UseDocumentContextOptions {
  currentDocumentId?: string | null;
  mentionedDocumentIds: string[];
  allowDismissCurrent?: boolean;
}

// Unified document context hook that manages document context for chat inputs
// Handles querying documents, building context items, and managing dismissal state
export function useDocumentContext({
  currentDocumentId,
  mentionedDocumentIds,
  allowDismissCurrent = true,
}: UseDocumentContextOptions) {
  const { organization } = useOrganization();
  const [isCurrentDocumentDismissed, setIsCurrentDocumentDismissed] = useState(false);

  const [documents] = useQuery(queries.documents.byUpdated({ organizationId: organization.id }));
  const [currentDocument] = useQuery(
    currentDocumentId
      ? queries.documents.byId({
          organizationId: organization.id,
          documentId: currentDocumentId,
        })
      : null,
  );

  const availableDocuments = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title || "Untitled document",
      })),
    [documents],
  );

  const documentTitleById = useMemo(() => {
    return new Map(availableDocuments.map((doc) => [doc.id, doc.title]));
  }, [availableDocuments]);

  const contextItems = useMemo(() => {
    const items: ChatContextItem[] = [];

    // Add current document if not dismissed
    if (currentDocument && !isCurrentDocumentDismissed) {
      items.push({
        id: currentDocument.id,
        type: "document",
        label: currentDocument.title || "Untitled document",
        source: "current",
        removable: allowDismissCurrent,
      });
    }

    // Add mentioned documents (excluding current document to avoid duplicates)
    for (const documentId of mentionedDocumentIds) {
      if (documentId === currentDocument?.id) continue;
      items.push({
        id: documentId,
        type: "document",
        label: documentTitleById.get(documentId) || "Untitled document",
        source: "mention",
      });
    }

    return items;
  }, [
    currentDocument,
    documentTitleById,
    isCurrentDocumentDismissed,
    mentionedDocumentIds,
    allowDismissCurrent,
  ]);

  const contextDocumentIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentDocument && !isCurrentDocumentDismissed) {
      ids.add(currentDocument.id);
    }
    for (const id of mentionedDocumentIds) {
      ids.add(id);
    }
    return Array.from(ids);
  }, [currentDocument, isCurrentDocumentDismissed, mentionedDocumentIds]);

  const handleRemoveContext = useCallback((item: ChatContextItem) => {
    if (item.source === "current") {
      setIsCurrentDocumentDismissed(true);
    }
  }, []);

  const resetDismissal = useCallback(() => {
    setIsCurrentDocumentDismissed(false);
  }, []);

  return {
    availableDocuments,
    currentDocument,
    contextItems,
    contextDocumentIds,
    documentTitleById,
    isCurrentDocumentDismissed,
    handleRemoveContext,
    resetDismissal,
  };
}
