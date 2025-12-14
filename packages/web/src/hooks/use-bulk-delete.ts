import { useCallback } from "react";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { toast } from "sonner";
import { mutators } from "@lydie/zero/mutators";

interface ItemType {
  id: string;
  type: "folder" | "document";
}

export function useBulkDelete() {
  const z = useZero();

  const handleDelete = useCallback(
    (selectedItems: ItemType[], onSelectionClear: () => void) => {
      const documentsToDelete = selectedItems.filter(
        (item) => item.type === "document"
      );
      const foldersToDelete = selectedItems.filter(
        (item) => item.type === "folder"
      );

      const totalItems = documentsToDelete.length + foldersToDelete.length;

      confirmDialog({
        title: "Delete Items",
        message: `Are you sure you want to delete ${totalItems} item${
          totalItems !== 1 ? "s" : ""
        }? This action cannot be undone.`,
        onConfirm: () => {
          try {
            documentsToDelete.forEach((item) => {
              z.mutate(mutators.document.delete({ documentId: item.id }));
            });
            foldersToDelete.forEach((item) => {
              z.mutate(mutators.folder.delete({ folderId: item.id }));
            });
            toast.success(
              `${totalItems} item${totalItems !== 1 ? "s" : ""} deleted`
            );
            onSelectionClear();
          } catch (error) {
            toast.error("Failed to delete items");
          }
        },
      });
    },
    [z]
  );

  return { handleDelete };
}
