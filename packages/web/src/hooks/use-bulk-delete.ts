import { mutators } from "@lydie/zero/mutators";
import { useCallback } from "react";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";

interface ItemType {
  id: string;
  type: "document";
}

export function useBulkDelete() {
  const z = useZero();
  const { organization } = useOrganization();

  const handleDelete = useCallback(
    (selectedItems: ItemType[], onSelectionClear: () => void) => {
      if (!organization) {
        toast.error("Organization not found");
        return;
      }

      const documentsToDelete = selectedItems.filter((item) => item.type === "document");

      const totalItems = documentsToDelete.length;

      confirmDialog({
        title: "Delete Items",
        message: `Are you sure you want to delete ${totalItems} item${
          totalItems !== 1 ? "s" : ""
        }? This action cannot be undone.`,
        onConfirm: () => {
          try {
            documentsToDelete.forEach((item) => {
              z.mutate(
                mutators.document.delete({
                  documentId: item.id,
                  organizationId: organization.id,
                }),
              );
            });
            toast.success(`${totalItems} item${totalItems !== 1 ? "s" : ""} deleted`);
            onSelectionClear();
          } catch {
            toast.error("Failed to delete items");
          }
        },
      });
    },
    [z, organization],
  );

  return { handleDelete };
}
