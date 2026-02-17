import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import type { PopoverProps } from "@lydie/ui/components/generic/Popover";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";

type DocumentMenuProps = {
  documentId: string;
  documentName: string;
  placement?: PopoverProps["placement"];
};

export function DocumentMenu({
  documentId,
  documentName,
  placement = "bottom end",
}: DocumentMenuProps) {
  const z = useZero();
  const { deleteDocument, publishDocument } = useDocumentActions();
  const { id: currentDocId } = useParams({ strict: false });
  const { organization } = useOrganization();

  const [document] = useQuery(
    queries.documents.byId({ organizationId: organization.id, documentId }),
  );

  const handleDelete = () => {
    if (document?.integration_link_id) {
      deleteDocument(documentId, currentDocId === documentId, document.integration_link_id);
      return;
    }

    const itemName = documentName;

    confirmDialog({
      title: `Delete "${itemName.length > 16 ? itemName.slice(0, 10) + "..." : itemName}"`,
      message: `This action cannot be undone. This document will be permanently deleted.`,
      onConfirm: () => {
        deleteDocument(documentId, currentDocId === documentId);
      },
    });
  };

  const handleToggleFavorite = () => {
    if (!document) return;

    try {
      z.mutate(
        mutators.document.toggleFavorite({
          documentId,
          organizationId: organization.id,
          isFavorited: !document.is_favorited,
        }),
      );

      toast.success(document.is_favorited ? "Removed from favorites" : "Added to favorites");
    } catch {
      toast.error("Failed to update favorite status");
    }
  };

  return (
    <Menu placement={placement}>
      <MenuItem onAction={handleToggleFavorite}>
        {document?.is_favorited ? "Unfavorite" : "Favorite"}
      </MenuItem>
      {document?.integration_link_id && !document?.published && (
        <MenuItem onAction={() => publishDocument(documentId)}>Publish</MenuItem>
      )}
      <MenuItem onAction={handleDelete}>Delete</MenuItem>
    </Menu>
  );
}
