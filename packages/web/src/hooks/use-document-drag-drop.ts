import { mutators } from "@lydie/zero/mutators";
import { isTextDropItem, useDragAndDrop } from "react-aria-components";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

interface ItemType {
  id: string;
  name: string;
  type: "document";
}

interface UseDocumentDragDropOptions {
  allDocuments: ReadonlyArray<{
    id: string;
    parent_id: string | null;
    sort_order?: number;
  }>;
}

function getSiblingsAtLevel(
  parentId: string | null,
  documents: ReadonlyArray<{
    id: string;
    parent_id: string | null;
    sort_order?: number;
  }>,
) {
  return documents
    .filter((d) => (d.parent_id ?? null) === parentId)
    .sort((a, b) => {
      const sortOrderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (sortOrderDiff !== 0) return sortOrderDiff;
      return 0;
    });
}

function reorderSiblings(
  movedIds: string[],
  targetId: string,
  dropPosition: "before" | "after",
  parentId: string | null,
  documents: ReadonlyArray<{
    id: string;
    parent_id: string | null;
    sort_order?: number;
  }>,
): string[] {
  const siblings = getSiblingsAtLevel(parentId, documents);
  const siblingsWithoutMoved = siblings.filter((s) => !movedIds.includes(s.id));

  const targetIndex = siblingsWithoutMoved.findIndex((s) => s.id === targetId);
  if (targetIndex === -1) return siblings.map((s) => s.id);

  const insertIndex = dropPosition === "before" ? targetIndex : targetIndex + 1;
  const reordered = [...siblingsWithoutMoved];
  reordered.splice(insertIndex, 0, ...movedIds.map((id) => ({ id, parent_id: parentId })));

  return reordered.map((item) => item.id);
}

export function useDocumentDragDrop({ allDocuments }: UseDocumentDragDropOptions) {
  const z = useZero();
  const { organization } = useOrganization();

  const moveDocument = (documentId: string, targetParentId: string | null) => {
    if (!organization) {
      toast.error("Organization not found");
      return false;
    }

    z.mutate(
      mutators.document.move({
        documentId,
        targetParentId,
        organizationId: organization.id,
      }),
    );

    return true;
  };

  const reorderDocuments = (documentIds: string[]) => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    z.mutate(
      mutators.document.reorder({
        documentIds,
        organizationId: organization.id,
      }),
    );
  };

  const createItemFromId = (itemId: string): ItemType | null => {
    const doc = allDocuments.find((d) => d.id === itemId);
    if (doc) {
      return {
        id: doc.id,
        name: (doc as any).title || "Untitled document",
        type: "document",
      };
    }
    return null;
  };

  const { dragAndDropHooks } = useDragAndDrop({
    getItems(keys) {
      return [...keys]
        .map((key) => createItemFromId(key as string))
        .filter((item): item is ItemType => item !== null)
        .map((item) => ({
          "lydie-item": JSON.stringify(item),
          "text/plain": item.name,
        }));
    },

    onDragStart(e) {
      const firstKey = [...e.keys][0];
      const item = createItemFromId(firstKey as string);
      if (item) {
        (window as any).__dragData = { docId: item.id, docName: item.name };
      }
    },

    onDragEnd() {
      (window as any).__dragData = null;
    },

    acceptedDragTypes: ["lydie-item"],
    getDropOperation: () => "move",

    shouldAcceptItemDrop(_target, types) {
      return types.has("lydie-item");
    },

    async onInsert(e) {
      try {
        const processedItems = await Promise.all(
          e.items
            .filter(isTextDropItem)
            .map(async (item) => JSON.parse(await item.getText("lydie-item"))),
        );

        const targetId = e.target.key as string;
        const targetDoc = allDocuments.find((d) => d.id === targetId);

        if (!targetDoc) return;

        if (e.target.dropPosition === "on") {
          for (const item of processedItems) {
            if (item.type === "document") {
              moveDocument(item.id, targetId);
            }
          }
        } else if (e.target.dropPosition === "before" || e.target.dropPosition === "after") {
          const targetParent = targetDoc.parent_id ?? null;
          const documentIdsToMove = processedItems.map((i) => i.id);

          for (const item of processedItems) {
            if (item.type === "document") {
              moveDocument(item.id, targetParent);
            }
          }

          const newOrder = reorderSiblings(
            documentIdsToMove,
            targetId,
            e.target.dropPosition,
            targetParent,
            allDocuments,
          );
          reorderDocuments(newOrder);
        }
      } catch (error) {
        console.error("Insert failed:", error);
        toast.error("Failed to move item");
      }
    },

    onMove(e) {
      const targetId = e.target.key as string;
      const targetDoc = allDocuments.find((d) => d.id === targetId);

      const draggedDocIds: string[] = [...e.keys].map((k) => k as string);

      if (!targetDoc) return;

      if (e.target.dropPosition === "before" || e.target.dropPosition === "after") {
        const targetParent = targetDoc.parent_id ?? null;

        for (const docId of draggedDocIds) {
          const item = createItemFromId(docId);
          if (item) {
            moveDocument(docId, targetParent);
          }
        }

        const newOrder = reorderSiblings(
          draggedDocIds,
          targetId,
          e.target.dropPosition,
          targetParent,
          allDocuments,
        );
        reorderDocuments(newOrder);
      } else if (e.target.dropPosition === "on") {
        for (const docId of draggedDocIds) {
          const item = createItemFromId(docId);
          if (item) moveDocument(docId, targetId);
        }
      }
    },

    onItemDrop(e) {
      const targetId = e.target.key as string;
      const targetDoc = allDocuments.find((d) => d.id === targetId);
      if (!targetDoc) return;

      const processItems = async () => {
        const items = await Promise.all(
          e.items
            .filter(isTextDropItem)
            .map(async (item) => JSON.parse(await item.getText("lydie-item"))),
        );

        for (const item of items) {
          moveDocument(item.id, targetId);
        }
      };
      processItems();
    },

    onReorder(e) {
      const targetId = e.target.key as string;
      const targetDoc = allDocuments.find((d) => d.id === targetId);
      if (!targetDoc) return;
      const newOrder = reorderSiblings(
        [...e.keys].map((k) => k as string),
        targetId,
        e.target.dropPosition,
        targetDoc.parent_id ?? null,
        allDocuments,
      );
      reorderDocuments(newOrder);
    },

    async onRootDrop(e) {
      const items = await Promise.all(
        e.items
          .filter(isTextDropItem)
          .map(async (item) => JSON.parse(await item.getText("lydie-item"))),
      );
      for (const item of items) {
        moveDocument(item.id, null);
      }
    },
  });

  return { dragAndDropHooks };
}
