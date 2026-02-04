import type { PopoverProps } from "@lydie/ui/components/generic/Popover";

import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Input, Label } from "@lydie/ui/components/generic/Field";
import { Menu, MenuItem, MenuSeparator } from "@lydie/ui/components/generic/Menu";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Form, Heading } from "react-aria-components";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { isAdmin } from "@/utils/admin";

import { CreateTemplateDialog } from "./CreateTemplateDialog";

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
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isCreateTemplateDialogOpen, setIsCreateTemplateDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(documentName);

  const z = useZero();
  const { deleteDocument, publishDocument } = useDocumentActions();
  const { id: currentDocId } = useParams({ strict: false });
  const { organization } = useOrganization();
  const { user } = useAuth();

  const [document] = useQuery(
    queries.documents.byId({ organizationId: organization.id, documentId }),
  );
  const userIsAdmin = isAdmin(user);

  useEffect(() => {
    if (isRenameDialogOpen) {
      setRenameValue(documentName);
    }
  }, [isRenameDialogOpen, documentName]);

  const handleRename = () => {
    if (!renameValue.trim()) {
      toast.error("Document name cannot be empty");
      return;
    }

    try {
      z.mutate(
        mutators.document.update({
          documentId,
          organizationId: organization.id,
          title: renameValue.trim(),
        }),
      );

      toast.success("Document renamed");
      setIsRenameDialogOpen(false);
    } catch {
      toast.error("Failed to rename document");
    }
  };

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
    <>
      <Menu placement={placement}>
        <MenuItem onAction={() => setIsInfoDialogOpen(true)}>Info</MenuItem>
        <MenuItem onAction={() => setIsRenameDialogOpen(true)}>Rename</MenuItem>
        <MenuItem onAction={handleToggleFavorite}>
          {document?.is_favorited ? "Unfavorite" : "Favorite"}
        </MenuItem>
        {document?.integration_link_id && !document?.published && (
          <MenuItem onAction={() => publishDocument(documentId)}>Publish</MenuItem>
        )}
        <MenuItem onAction={handleDelete}>Delete</MenuItem>
        <MenuSeparator />
        {userIsAdmin && (
          <MenuItem onAction={() => setIsCreateTemplateDialogOpen(true)}>Create template</MenuItem>
        )}
      </Menu>

      <Modal isOpen={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen} isDismissable>
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              handleRename();
            }}
          >
            <div className="p-3">
              <Heading slot="title" className="text-sm font-medium text-gray-700">
                Rename Document
              </Heading>
            </div>
            <Separator />
            <div className="p-3 space-y-4">
              <TextField value={renameValue} onChange={setRenameValue}>
                <Label>Document Name</Label>
                <Input />
              </TextField>
              <div className="flex justify-end gap-2">
                <Button
                  intent="secondary"
                  onPress={() => {
                    setIsRenameDialogOpen(false);
                    setRenameValue(documentName);
                  }}
                  size="sm"
                  type="button"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Rename
                </Button>
              </div>
            </div>
          </Form>
        </Dialog>
      </Modal>

      <Modal isOpen={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen} isDismissable size="md">
        <Dialog>
          <div className="p-3">
            <Heading slot="title" className="text-sm font-medium text-gray-700">
              Document Info
            </Heading>
          </div>
          <Separator />
          <div className="p-3 space-y-4">
            {document ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Title</Label>
                  <p className="text-sm text-gray-900 mt-1">{document.title}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Slug</Label>
                  <p className="text-sm text-gray-900 mt-1 font-mono">{document.slug}</p>
                </div>
                <div role="group" aria-labelledby="publication-status-label">
                  <Label id="publication-status-label" className="text-xs text-gray-500">
                    Publication Status
                  </Label>
                  <div className="mt-1">
                    <span
                      className={`text-xs px-2 py-1 rounded inline-block ${
                        document.published
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {document.published ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
                {document.created_at && (
                  <div>
                    <Label className="text-xs text-gray-500">Created</Label>
                    <p className="text-sm text-gray-900 mt-1">
                      {format(new Date(document.created_at), "PPpp")}
                    </p>
                  </div>
                )}
                {document.updated_at && (
                  <div>
                    <Label className="text-xs text-gray-500">Last Updated</Label>
                    <p className="text-sm text-gray-900 mt-1">
                      {format(new Date(document.updated_at), "PPpp")}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
            <div className="flex justify-end">
              <Button intent="secondary" onPress={() => setIsInfoDialogOpen(false)} size="sm">
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>

      <CreateTemplateDialog
        isOpen={isCreateTemplateDialogOpen}
        onOpenChange={setIsCreateTemplateDialogOpen}
        documentId={documentId}
        onSuccess={() => setIsCreateTemplateDialogOpen(false)}
      />
    </>
  );
}
