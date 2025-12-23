import { createId } from "@lydie/core/id";
import { useRouter } from "@tanstack/react-router";
import { useZero } from "@/services/zero";
import { useOrganizationContext } from "@/context/organization-provider";
import { toast } from "sonner";
import { confirmDialog } from "@/stores/confirm-dialog";
import { mutators } from "@lydie/zero/mutators";
import { isLocalOrganization } from "@/lib/local-organization";

export function useDocumentActions() {
  const z = useZero();
  const router = useRouter();
  const { organizationId } = useOrganizationContext();
  const isLocal = isLocalOrganization(organizationId);

  const createDocument = async (folderId?: string) => {
    if (!organizationId) {
      toast.error("Something went wrong, please try again or contact support.");
      return;
    }

    const id = createId();
    z.mutate(
      mutators.document.create({
        id,
        organizationId,
        title: "",
        folderId,
      })
    );

    console.log("createDocument", folderId);

    // Use history.pushState for simpler navigation
    if (isLocal) {
      router.history.push(`/__unauthed/${id}`);
    } else {
      router.history.push(`/w/${organizationId}/${id}`);
    }
  };

  const createFolder = async () => {
    try {
      const folderId = createId();
      z.mutate(
        mutators.folder.create({
          id: folderId,
          name: "New Folder",
          organizationId,
        })
      );
    } catch (error) {
      toast.error("Failed to create folder");
    }
  };

  const deleteDocument = (documentId: string, redirectAfterDelete = false) => {
    try {
      z.mutate(
        mutators.document.delete({
          documentId,
          organizationId,
        })
      );
      toast.success("Document deleted");

      if (redirectAfterDelete) {
        router.history.back();
      }
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  const deleteFolder = (folderId: string) => {
    if (!organizationId) {
      toast.error("Organization not found");
      return;
    }

    confirmDialog({
      title: "Delete Folder",
      message:
        "Are you sure you want to delete this folder? This action cannot be undone.",
      onConfirm: () => {
        try {
          z.mutate(mutators.folder.delete({ folderId, organizationId }));
          toast.success("Folder deleted");
        } catch (error) {
          toast.error("Failed to delete folder");
        }
      },
    });
  };

  const publishDocument = (documentId: string) => {
    if (isLocalOrganization(organizationId)) {
      toast.error("Publishing is not available in local mode");
      return;
    }
    z.mutate(
      mutators.document.publish({
        documentId,
        organizationId,
      })
    );
  };

  const updateDocument = (documentId: string, data: any) => {
    z.mutate(
      mutators.document.update({
        documentId,
        organizationId,
        ...data,
      })
    );
  };

  return {
    createDocument,
    createFolder,
    deleteDocument,
    deleteFolder,
    publishDocument,
    updateDocument,
  };
}
