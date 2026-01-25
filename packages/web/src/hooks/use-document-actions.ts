import { createId } from "@lydie/core/id";
import { mutators } from "@lydie/zero/mutators";
import { useNavigate } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

export function useDocumentActions() {
  const z = useZero();
  const navigate = useNavigate();
  const { navigate: routerNavigate } = useRouter();
  const { organization } = useOrganization();

  const createDocument = async (parentId?: string, integrationLinkId?: string) => {
    const id = createId();
    z.mutate(
      mutators.document.create({
        id,
        organizationId: organization.id,
        parentId,
        integrationLinkId,
      }),
    );

    navigate({
      from: "/w/$organizationSlug",
      to: "/w/$organizationSlug/$id",
      params: { id, organizationSlug: organization.slug || "" },
    });
  };

  const deleteDocument = (
    documentId: string,
    redirectAfterDelete = false,
    integrationLinkId?: string | null,
  ) => {
    const performDelete = () => {
      try {
        z.mutate(
          mutators.document.delete({
            documentId,
            organizationId: organization.id,
          }),
        );

        toast.success("Document deleted");

        if (redirectAfterDelete) {
          routerNavigate({
            to: "..",
          });
        }
      } catch {
        toast.error("Failed to delete document");
      }
    };

    if (integrationLinkId) {
      const { confirmDialog } = require("@/stores/confirm-dialog");
      confirmDialog({
        title: "Delete from Integration?",
        message:
          "This document is part of an integration. Deleting it will also delete the corresponding file in the external provider (e.g. GitHub). This action cannot be undone.",
        confirmLabel: "Delete & Remove",
        destuctive: true,
        onConfirm: performDelete,
      });
    } else {
      performDelete();
    }
  };

  const publishDocument = (documentId: string) => {
    z.mutate(
      mutators.document.publish({
        documentId,
        organizationId: organization.id,
      }),
    );
  };

  const unpublishDocument = (documentId: string) => {
    z.mutate(
      mutators.document.unpublish({
        documentId,
        organizationId: organization.id,
      }),
    );
  };

  const updateDocument = (documentId: string, data: any) => {
    z.mutate(
      mutators.document.update({
        documentId,
        organizationId: organization.id,
        ...data,
      }),
    );
  };

  return {
    createDocument,
    deleteDocument,
    publishDocument,
    unpublishDocument,
    updateDocument,
  };
}
