import { useDragAndDrop, isTextDropItem } from "react-aria-components";
import { useZero } from "@/services/zero";
import { useOrganization } from "@/context/organization.context";
import { toast } from "sonner";
import { mutators } from "@lydie/zero/mutators";

const enableLogging = false;

interface ItemType {
  id: string;
  name: string;
  type: "document";
  updated_at?: number | string | null;
}

interface UseDocumentDragDropOptions {
  allDocuments: ReadonlyArray<{ id: string; parent_id: string | null }>;
}

function isDocumentDescendant(
  ancestorId: string,
  descendantId: string,
  documents: ReadonlyArray<{ id: string; parent_id: string | null }>
): boolean {
  const descendant = documents.find((d) => d.id === descendantId);
  if (!descendant) return false;

  if (descendant.parent_id === ancestorId) return true;
  if (descendant.parent_id) {
    return isDocumentDescendant(ancestorId, descendant.parent_id, documents);
  }

  return false;
}

/**
 * Drag and drop hook for documents using page-hierarchy (parent_id).
 * Works with both GridList and Tree components from react-aria-components.
 */
export function useDocumentDragDrop({
  allDocuments,
}: UseDocumentDragDropOptions) {
  const z = useZero();
  const { organization } = useOrganization();

  const moveDocument = (
    documentId: string,
    targetParentId: string | null | undefined
  ) => {
    if (!organization) {
      toast.error("Organization not found");
      return false;
    }

    const doc = allDocuments.find((d) => d.id === documentId);
    const normalizedParentTarget = targetParentId ?? null;

    // Skip if document is already in target location
    if (doc && (doc.parent_id ?? null) === normalizedParentTarget) {
      return false;
    }

    z.mutate(
      mutators.document.moveToParent({
        documentId,
        parentId: targetParentId === null ? undefined : targetParentId,
        organizationId: organization.id,
      })
    );
    return true;
  };

  // Create item from ID (for tree where we only have keys)
  const createItemFromId = (itemId: string): ItemType | null => {
    const doc = allDocuments.find((d) => d.id === itemId);
    if (doc) {
      return {
        id: doc.id,
        name: (doc as any).title || "Untitled document",
        type: "document" as const,
      };
    }

    return null;
  };

  const { dragAndDropHooks } = useDragAndDrop({
    // Provide drag data
    getItems(keys, items) {
      if (enableLogging) {
        console.log("[DragDrop] getItems", { keys: [...keys], items });
      }

      // If items are provided (GridList), use them directly
      if (items && items.length > 0) {
        return (items as ItemType[]).map((item) => ({
          "lydie-item": JSON.stringify(item),
          "text/plain": item.name,
        }));
      }

      // Otherwise construct from keys (Tree)
      return [...keys]
        .map((key) => createItemFromId(key as string))
        .filter((item): item is ItemType => item !== null)
        .map((item) => ({
          "lydie-item": JSON.stringify(item),
          "text/plain": item.name,
        }));
    },

    // Accept drops with custom format
    acceptedDragTypes: ["lydie-item"],

    // Always move, never copy
    getDropOperation: () => "move",

    // Check if a drop target should accept the drop
    shouldAcceptItemDrop(target, types) {
      // Only accept our custom drag type
      if (!types.has("lydie-item")) {
        return false;
      }

      // Additional validation can be done here if needed
      // The mutator will handle circular reference checks
      return true;
    },

    // Handle drops between items from other trees/components
    async onInsert(e) {
      if (enableLogging) {
        console.log("[DragDrop] onInsert", {
          target: e.target.key,
          dropPosition: e.target.dropPosition,
        });
      }

      try {
        const processedItems = await Promise.all(
          e.items
            .filter(isTextDropItem)
            .map(async (item) => JSON.parse(await item.getText("lydie-item")))
        );

        const targetId = e.target.key as string;

        if (e.target.dropPosition === "on") {
          // Dropping directly on a document - make items children of that document
          const targetDocument = allDocuments.find((d) => d.id === targetId);

          if (targetDocument) {
            // Dropping on a document - make items children of that document
            for (const item of processedItems) {
              if (item.type === "document") {
                moveDocument(item.id, targetId);
              }
            }
          }
        } else if (
          e.target.dropPosition === "before" ||
          e.target.dropPosition === "after"
        ) {
          // Dropping before/after an item - move to the same parent as the target
          const targetDoc = allDocuments.find((d) => d.id === targetId);
          if (!targetDoc) return;

          const targetParent = targetDoc.parent_id ?? null;

          // Move all items to target's parent
          for (const item of processedItems) {
            if (item.type === "document") {
              moveDocument(item.id, targetParent);
            }
          }
        }
      } catch (error) {
        console.error("Insert failed:", error);
        toast.error("Failed to move item");
      }
    },

    // Handle moving items within the same tree or to different levels
    onMove(e) {
      if (enableLogging) {
        console.log("[DragDrop] onMove", {
          target: e.target.key,
          dropPosition: e.target.dropPosition,
          keys: [...e.keys],
        });
      }

      try {
        const targetId = e.target.key as string;

        if (
          e.target.dropPosition === "before" ||
          e.target.dropPosition === "after"
        ) {
          // Move before/after target - move to same parent as target
          const targetDoc = allDocuments.find((d) => d.id === targetId);
          if (!targetDoc) return;

          const targetParent = targetDoc.parent_id ?? null;

          // Move all dragged items to target's parent
          for (const key of e.keys) {
            const item = createItemFromId(key as string);
            if (item && item.type === "document") {
              moveDocument(item.id, targetParent);
            }
          }
        } else if (e.target.dropPosition === "on") {
          // Move into target document - make items children of that document
          const targetDocument = allDocuments.find((d) => d.id === targetId);

          if (targetDocument) {
            // Move all dragged items to be children of the target document
            for (const key of e.keys) {
              const item = createItemFromId(key as string);
              if (item && item.type === "document") {
                moveDocument(item.id, targetId);
              }
            }
          }
        }
      } catch (error) {
        console.error("Move failed:", error);
        toast.error("Failed to move item");
      }
    },

    // Handle dropping on items (alternative to onMove with dropPosition === "on")
    onItemDrop(e) {
      if (enableLogging) {
        console.log("[DragDrop] onItemDrop", {
          target: e.target.key,
          keys: [...e.keys],
        });
      }

      try {
        const targetId = e.target.key as string;
        const targetDocument = allDocuments.find((d) => d.id === targetId);

        if (targetDocument) {
          // Dropping on a document - make items children of that document
          for (const key of e.keys) {
            const item = createItemFromId(key as string);
            if (item && item.type === "document") {
              moveDocument(item.id, targetId);
            }
          }
        }
      } catch (error) {
        console.error("Item drop failed:", error);
        toast.error("Failed to move item");
      }
    },

    // Handle reordering within GridList
    onReorder(e) {
      if (enableLogging) {
        console.log("[DragDrop] onReorder", {
          target: e.target.key,
          keys: [...e.keys],
        });
      }
      // Reordering within same level - no backend changes needed for now
      // This is handled by the list state automatically
    },

    // Handle drops on root (empty area)
    async onRootDrop(e) {
      if (enableLogging) {
        console.log("[DragDrop] onRootDrop");
      }

      try {
        const processedItems = await Promise.all(
          e.items
            .filter(isTextDropItem)
            .map(async (item) => JSON.parse(await item.getText("lydie-item")))
        );

        // Move items to root (no parent)
        for (const item of processedItems) {
          if (item.type === "document") {
            moveDocument(item.id, null);
          }
        }
      } catch (error) {
        console.error("Root drop failed:", error);
        toast.error("Failed to move item");
      }
    },

    // Remove the items from the source tree on drop
    // if they were moved to a different tree.
    // Note: In our case, Zero mutations handle the state updates automatically,
    // but we can use this for logging or additional cleanup if needed.
    onDragEnd(e) {
      if (enableLogging) {
        console.log("[DragDrop] onDragEnd", {
          dropOperation: e.dropOperation,
          isInternal: e.isInternal,
          keys: [...e.keys],
        });
      }
      // Items are automatically removed from source when moved via Zero mutations
    },
  });

  return { dragAndDropHooks };
}
