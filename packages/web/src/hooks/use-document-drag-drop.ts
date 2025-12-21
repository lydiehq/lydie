import { useDragAndDrop, isTextDropItem } from "react-aria-components";
import { useZero } from "@/services/zero";
import { useOrganization } from "@/context/organization.context";
import { toast } from "sonner";
import { mutators } from "@lydie/zero/mutators";

const enableLogging = false;

interface ItemType {
  id: string;
  name: string;
  type: "folder" | "document";
  updated_at?: number | string | null;
}

interface UseDocumentDragDropOptions {
  allFolders: ReadonlyArray<{ id: string; parent_id: string | null }>;
  allDocuments: ReadonlyArray<{ id: string; folder_id: string | null }>;
  currentFolderId?: string | null;
}

function isDescendant(
  ancestorId: string,
  descendantId: string,
  folders: ReadonlyArray<{ id: string; parent_id: string | null }>
): boolean {
  const descendant = folders.find((f) => f.id === descendantId);
  if (!descendant) return false;

  if (descendant.parent_id === ancestorId) return true;
  if (descendant.parent_id) {
    return isDescendant(ancestorId, descendant.parent_id, folders);
  }

  return false;
}

/**
 * Unified drag and drop hook for documents and folders.
 * Works with both GridList and Tree components from react-aria-components.
 */
export function useDocumentDragDrop({
  allFolders,
  allDocuments,
  currentFolderId,
}: UseDocumentDragDropOptions) {
  const z = useZero();
  const { organization } = useOrganization();

  const moveDocumentToFolder = (
    documentId: string,
    targetFolderId: string | null | undefined
  ) => {
    if (!organization) {
      toast.error("Organization not found");
      return false;
    }
    
    const doc = allDocuments.find((d) => d.id === documentId);
    const normalizedTarget = targetFolderId ?? null;

    // Skip if document is already in target folder
    if (doc && (doc.folder_id ?? null) === normalizedTarget) {
      return false;
    }

    z.mutate(
      mutators.document.moveToFolder({
        documentId,
        folderId: targetFolderId === null ? undefined : targetFolderId,
        organizationId: organization.id,
      })
    );
    return true;
  };

  const moveFolderToParent = (
    folderId: string,
    targetParentId: string | null | undefined
  ) => {
    if (!organization) {
      toast.error("Organization not found");
      return false;
    }
    
    const folder = allFolders.find((f) => f.id === folderId);
    const normalizedTarget = targetParentId ?? null;

    // Skip if folder is already in target location
    if (folder && (folder.parent_id ?? null) === normalizedTarget) {
      return false;
    }

    // Check for circular reference when moving into a folder
    if (targetParentId && isDescendant(folderId, targetParentId, allFolders)) {
      toast.error("Cannot move folder into itself or its descendants");
      return false;
    }

    z.mutate(
      mutators.folder.move({
        folderId,
        newParentId: targetParentId || undefined,
        organizationId: organization.id,
      })
    );
    return true;
  };

  const moveItemToFolder = (
    item: ItemType,
    targetFolderId: string | null | undefined
  ) => {
    if (item.type === "document") {
      return moveDocumentToFolder(item.id, targetFolderId);
    } else {
      return moveFolderToParent(item.id, targetFolderId);
    }
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

    const folder = allFolders.find((f) => f.id === itemId);
    if (folder) {
      return {
        id: folder.id,
        name: (folder as any).name,
        type: "folder" as const,
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
          // Dropping directly on a folder - move items into that folder
          const targetFolder = allFolders.find((f) => f.id === targetId);
          if (targetFolder) {
            for (const item of processedItems) {
              moveItemToFolder(item, targetId);
            }
          }
        } else if (
          e.target.dropPosition === "before" ||
          e.target.dropPosition === "after"
        ) {
          // Dropping before/after an item - move to the same parent as the target
          const targetItem = createItemFromId(targetId);
          if (!targetItem) return;

          // Find target's parent
          const targetFolder =
            targetItem.type === "folder"
              ? allFolders.find((f) => f.id === targetId)?.parent_id ?? null
              : allDocuments.find((d) => d.id === targetId)?.folder_id ?? null;

          // Move all items to target's parent
          for (const item of processedItems) {
            moveItemToFolder(item, targetFolder);
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

        if (e.target.dropPosition === "before") {
          // Move before target - move to same parent as target
          const targetItem = createItemFromId(targetId);
          if (!targetItem) return;

          // Find target's parent
          const targetFolder =
            targetItem.type === "folder"
              ? allFolders.find((f) => f.id === targetId)?.parent_id ?? null
              : allDocuments.find((d) => d.id === targetId)?.folder_id ?? null;

          // Move all dragged items to target's parent
          for (const key of e.keys) {
            const item = createItemFromId(key as string);
            if (item) {
              moveItemToFolder(item, targetFolder);
            }
          }
        } else if (e.target.dropPosition === "after") {
          // Move after target - move to same parent as target
          const targetItem = createItemFromId(targetId);
          if (!targetItem) return;

          // Find target's parent
          const targetFolder =
            targetItem.type === "folder"
              ? allFolders.find((f) => f.id === targetId)?.parent_id ?? null
              : allDocuments.find((d) => d.id === targetId)?.folder_id ?? null;

          // Move all dragged items to target's parent
          for (const key of e.keys) {
            const item = createItemFromId(key as string);
            if (item) {
              moveItemToFolder(item, targetFolder);
            }
          }
        } else if (e.target.dropPosition === "on") {
          // Move into target - only allow if target is a folder
          const targetFolder = allFolders.find((f) => f.id === targetId);
          if (!targetFolder) return;

          // Move all dragged items into the target folder
          for (const key of e.keys) {
            const item = createItemFromId(key as string);
            if (item) {
              moveItemToFolder(item, targetId);
            }
          }
        }
      } catch (error) {
        console.error("Move failed:", error);
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

        // Use current folder context if provided, otherwise move to root
        const targetFolder = currentFolderId ?? null;
        for (const item of processedItems) {
          moveItemToFolder(item, targetFolder);
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
