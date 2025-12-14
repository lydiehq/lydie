import { createId } from "@lydie/core/id";
import { useNavigate } from "@tanstack/react-router";
import { useZero } from "@/services/zero";
import { useOrganization } from "@/context/organization.context";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";
import { confirmDialog } from "@/stores/confirm-dialog";
import { mutators } from "@lydie/zero/mutators";

export function useDocumentActions() {
  const z = useZero();
  const navigate = useNavigate();
  const { navigate: routerNavigate } = useRouter();
  const { organization } = useOrganization();

  const createDocument = async (folderId?: string) => {
    if (!organization) {
      toast.error("Something went wrong, please try again or contact support.");
      return;
    }

    const id = createId();
    z.mutate(
      mutators.document.create({
        id,
        organizationId: organization.id,
        title: "",
        folderId,
      })
    );

    navigate({
      from: "/w/$organizationId",
      to: "/w/$organizationId/$id",
      params: { id },
    });
  };

  const createFolder = async () => {
    try {
      const folderId = createId();
      z.mutate(
        mutators.folder.create({
          id: folderId,
          name: "New Folder",
          organizationId: organization?.id || "",
        })
      );
    } catch (error) {
      toast.error("Failed to create folder");
    }
  };

  const deleteDocument = (documentId: string, redirectAfterDelete = false) => {
    try {
      z.mutate(mutators.document.delete({ documentId }));
      toast.success("Document deleted");

      if (redirectAfterDelete) {
        routerNavigate({
          to: "..",
        });
      }
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  const deleteFolder = (folderId: string) => {
    confirmDialog({
      title: "Delete Folder",
      message:
        "Are you sure you want to delete this folder? This action cannot be undone.",
      onConfirm: () => {
        try {
          z.mutate(mutators.folder.delete({ folderId }));
          toast.success("Folder deleted");
        } catch (error) {
          toast.error("Failed to delete folder");
        }
      },
    });
  };

  return {
    createDocument,
    createFolder,
    deleteDocument,
    deleteFolder,
  };
}
