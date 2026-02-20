import { createId } from "@lydie/core/id";
import { mutators } from "@lydie/zero/mutators";
import { useRouter } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { toast } from "sonner";

import { closeDocumentTabAtom, openPersistentTabAtom } from "@/atoms/tabs";
import { useOrganization } from "@/context/organization.context";
import { trackEvent } from "@/lib/posthog";
import { useZero } from "@/services/zero";

export function useDocumentActions() {
  const z = useZero();
  const { navigate: routerNavigate } = useRouter();
  const { organization } = useOrganization();
  const openPersistentTab = useSetAtom(openPersistentTabAtom);
  const closeDocumentTab = useSetAtom(closeDocumentTabAtom);

  const createDocument = async (
    parentId?: string,
    integrationLinkId?: string,
    initialContent?: string,
    title?: string,
    collectionId?: string,
  ) => {
    const id = createId();
    const documentTitle = title || "Untitled";

    z.mutate(
      mutators.document.create({
        id,
        organizationId: organization.id,
        parentId,
        collectionId,
        integrationLinkId,
        content: initialContent,
        title,
      }),
    );

    // Immediately open the tab so it appears before navigation completes
    openPersistentTab({ documentId: id, title: documentTitle });

    trackEvent("document_created", {
      has_parent: !!parentId,
      has_integration: !!integrationLinkId,
      has_collection: !!collectionId,
      has_initial_content: !!initialContent,
    });

    void routerNavigate({
      href: `/w/${organization.slug || ""}/${id}`,
    });
  };

  const deleteDocument = async (
    documentId: string,
    redirectAfterDelete = false,
    integrationLinkId?: string | null,
    showToast = true,
  ) => {
    const performDelete = async () => {
      try {
        await z.mutate(
          mutators.document.delete({
            documentId,
            organizationId: organization.id,
          }),
        );

        trackEvent("document_deleted", {
          has_integration: !!integrationLinkId,
        });

        // Remove the tab from the tab bar
        closeDocumentTab(documentId);

        if (showToast) {
          toast.success("Document deleted");
        }

        if (redirectAfterDelete) {
          void routerNavigate({
            to: "..",
          });
        }

        return true;
      } catch {
        toast.error("Failed to delete document");

        return false;
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
        onConfirm: () => {
          void performDelete();
        },
      });

      return false;
    } else {
      return await performDelete();
    }
  };

  const publishDocument = (documentId: string) => {
    z.mutate(
      mutators.document.publish({
        documentId,
        organizationId: organization.id,
      }),
    );

    trackEvent("document_published");
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
