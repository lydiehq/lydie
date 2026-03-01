import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Input, Label } from "@lydie/ui/components/generic/Field";
import { Modal } from "@lydie/ui/components/generic/Modal";
import type { PopoverProps } from "@lydie/ui/components/generic/Popover";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Form, TextField } from "react-aria-components";
import { toast } from "sonner";

import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/atoms/confirm-dialog";
import { isAdmin } from "@/utils/admin";

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
  const { user } = useAuth();
  const { deleteDocument, publishDocument } = useDocumentActions();
  const { id: currentDocId } = useParams({ strict: false });
  const { organization } = useOrganization();
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(documentName || "");
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  const [document] = useQuery(
    queries.documents.byId({ organizationId: organization.id, documentId }),
  );

  const handleDelete = () => {
    if (document?.integration_link_id) {
      void deleteDocument(documentId, currentDocId === documentId, document.integration_link_id);
      return;
    }

    const itemName = documentName;

    confirmDialog({
      title: `Move "${itemName.length > 16 ? itemName.slice(0, 10) + "..." : itemName}" to trash?`,
      message: `This document will be moved to trash. You can restore it later from the trash.`,
      onConfirm: () => {
        void deleteDocumentWithUndo(documentId, currentDocId === documentId);
      },
    });
  };

  const deleteDocumentWithUndo = async (docId: string, shouldRedirect: boolean) => {
    const isDeleted = await deleteDocument(docId, shouldRedirect, undefined, false);
    if (!isDeleted) {
      return;
    }

    toast("Document deleted", {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            await z.mutate(
              mutators.document.restore({
                documentId: docId,
                organizationId: organization.id,
              }),
            );
            toast.success("Document restored");
          } catch {
            toast.error("Failed to restore document");
          }
        },
      },
    });
  };

  const handleToggleFavorite = () => {
    if (!document) return;

    const nextIsFavorited = !document.is_favorited;

    try {
      z.mutate(
        mutators.document.toggleFavorite({
          documentId,
          organizationId: organization.id,
          isFavorited: nextIsFavorited,
        }),
      );

      toast(nextIsFavorited ? "Added to favorites" : "Removed from favorites", {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            z.mutate(
              mutators.document.toggleFavorite({
                documentId,
                organizationId: organization.id,
                isFavorited: document.is_favorited,
              }),
            );
            toast.success("Favorite change undone");
          },
        },
      });
    } catch {
      toast.error("Failed to update favorite status");
    }
  };

  const handleCreateTemplateFromPage = async () => {
    if (!templateName.trim() || isCreatingTemplate) {
      return;
    }

    setIsCreatingTemplate(true);
    try {
      await z.mutate(
        mutators.template.create({
          name: templateName.trim(),
          rootDocumentId: documentId,
          organizationId: organization.id,
        }),
      );
      toast.success("Template created");
      setIsCreateTemplateOpen(false);
    } catch (error) {
      console.error("Failed to create template:", error);
      toast.error("Failed to create template");
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  return (
    <>
      <Menu placement={placement}>
        <MenuItem onAction={handleToggleFavorite}>
          {document?.is_favorited ? "Unfavorite" : "Favorite"}
        </MenuItem>
        {isAdmin(user) && (
          <MenuItem
            onAction={() => {
              setTemplateName(documentName || "Untitled template");
              setIsCreateTemplateOpen(true);
            }}
          >
            Create template from page
          </MenuItem>
        )}
        {document?.integration_link_id && !document?.published && (
          <MenuItem onAction={() => publishDocument(documentId)}>Publish</MenuItem>
        )}
        <MenuItem onAction={handleDelete}>Delete</MenuItem>
      </Menu>

      <Modal
        isOpen={isCreateTemplateOpen}
        onOpenChange={setIsCreateTemplateOpen}
        isDismissable={!isCreatingTemplate}
      >
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateTemplateFromPage();
            }}
            className="p-3 space-y-3"
          >
            <div className="text-sm font-medium text-gray-800">Create template from page</div>
            <TextField value={templateName} onChange={setTemplateName}>
              <Label>Template name</Label>
              <Input />
            </TextField>
            <div className="text-xs text-gray-500">
              Includes subpages and referenced collection schemas/views.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded border border-gray-200"
                onClick={() => setIsCreateTemplateOpen(false)}
                disabled={isCreatingTemplate}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                disabled={!templateName.trim() || isCreatingTemplate}
              >
                {isCreatingTemplate ? "Creating..." : "Create"}
              </button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </>
  );
}
