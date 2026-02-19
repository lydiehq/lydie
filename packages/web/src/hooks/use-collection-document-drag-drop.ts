import { mutators } from "@lydie/zero/mutators";
import { isTextDropItem, useDragAndDrop } from "react-aria-components";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

type CollectionDocument = {
  id: string;
  title?: string | null;
  parent_id: string | null;
  sort_order?: number;
};

type DragItem = {
  id: string;
  name: string;
  type: "document";
};

function sortByOrder(documents: CollectionDocument[]): CollectionDocument[] {
  return [...documents].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function getSiblingOrder(
  parentId: string | null,
  documents: ReadonlyArray<CollectionDocument>,
  movedIds: string[],
  targetId: string,
  position: "before" | "after",
): string[] {
  const siblings = sortByOrder(
    documents.filter((document) => (document.parent_id ?? null) === parentId),
  );
  const stable = siblings.filter((document) => !movedIds.includes(document.id));
  const targetIndex = stable.findIndex((document) => document.id === targetId);

  if (targetIndex === -1) {
    return siblings.map((document) => document.id);
  }

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  const reordered = [...stable];
  reordered.splice(insertIndex, 0, ...movedIds.map((id) => ({ id, parent_id: parentId })));
  return reordered.map((document) => document.id);
}

export function useCollectionDocumentDragDrop(allDocuments: ReadonlyArray<CollectionDocument>) {
  const { organization } = useOrganization();
  const z = useZero();

  const moveDocument = async (documentId: string, targetParentId: string | null) => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    await z.mutate(
      mutators.document.move({
        documentId,
        targetParentId,
        targetIntegrationLinkId: null,
        organizationId: organization.id,
      }),
    );
  };

  const reorderDocuments = async (documentIds: string[]) => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    await z.mutate(
      mutators.document.reorder({
        documentIds,
        organizationId: organization.id,
      }),
    );
  };

  const toDragItem = (documentId: string): DragItem | null => {
    const document = allDocuments.find((entry) => entry.id === documentId);
    if (!document) {
      return null;
    }

    return {
      id: document.id,
      name: document.title || "Untitled document",
      type: "document",
    };
  };

  const parseDropItems = async (items: Iterable<any>): Promise<DragItem[]> => {
    const parsed = await Promise.all(
      [...items]
        .filter((item) => isTextDropItem(item))
        .map(async (item) => JSON.parse(await item.getText("lydie-item")) as DragItem),
    );

    return parsed.filter((item) => item.type === "document");
  };

  const { dragAndDropHooks } = useDragAndDrop({
    acceptedDragTypes: ["lydie-item"],
    getDropOperation: () => "move",
    shouldAcceptItemDrop: (_target, types) => types.has("lydie-item"),
    getItems(keys) {
      return [...keys]
        .map((key) => toDragItem(String(key)))
        .filter((item): item is DragItem => item !== null)
        .map((item) => ({
          "lydie-item": JSON.stringify(item),
          "text/plain": item.name,
        }));
    },
    async onInsert(event) {
      try {
        const dropped = await parseDropItems(event.items);
        if (dropped.length === 0) {
          return;
        }

        const targetId = String(event.target.key);
        const targetDocument = allDocuments.find((document) => document.id === targetId);
        if (!targetDocument) {
          return;
        }

        if (event.target.dropPosition === "on") {
          await Promise.all(dropped.map((item) => moveDocument(item.id, targetId)));
          return;
        }

        if (event.target.dropPosition === "before" || event.target.dropPosition === "after") {
          const targetParentId = targetDocument.parent_id ?? null;
          await Promise.all(dropped.map((item) => moveDocument(item.id, targetParentId)));

          const reorderedIds = getSiblingOrder(
            targetParentId,
            allDocuments,
            dropped.map((item) => item.id),
            targetId,
            event.target.dropPosition,
          );
          await reorderDocuments(reorderedIds);
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to move collection entry");
      }
    },
    async onMove(event) {
      try {
        const targetId = String(event.target.key);
        const targetDocument = allDocuments.find((document) => document.id === targetId);
        if (!targetDocument) {
          return;
        }

        const movedIds = [...event.keys].map(String);

        if (event.target.dropPosition === "on") {
          await Promise.all(movedIds.map((documentId) => moveDocument(documentId, targetId)));
          return;
        }

        if (event.target.dropPosition === "before" || event.target.dropPosition === "after") {
          const targetParentId = targetDocument.parent_id ?? null;
          await Promise.all(movedIds.map((documentId) => moveDocument(documentId, targetParentId)));

          const reorderedIds = getSiblingOrder(
            targetParentId,
            allDocuments,
            movedIds,
            targetId,
            event.target.dropPosition,
          );
          await reorderDocuments(reorderedIds);
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to move collection entry");
      }
    },
    async onRootDrop(event) {
      try {
        const dropped = await parseDropItems(event.items);
        if (dropped.length === 0) {
          return;
        }

        await Promise.all(dropped.map((item) => moveDocument(item.id, null)));
      } catch (error) {
        console.error(error);
        toast.error("Failed to move collection entry");
      }
    },
  });

  return { dragAndDropHooks };
}
