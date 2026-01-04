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

  const createDocument = async (parentId?: string) => {
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
        parentId,
      })
    );

    await navigate({
      from: "/w/$organizationSlug",
      to: "/w/$organizationSlug/$id",
      params: { id, organizationSlug: organization.slug || "" },
    });
    
    return id;
  };

  const deleteDocument = (documentId: string, redirectAfterDelete = false) => {
    try {
      z.mutate(
        mutators.document.delete({
          documentId,
          organizationId: organization?.id || "",
        })
      );
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

  const publishDocument = (documentId: string) => {
    z.mutate(
      mutators.document.publish({
        documentId,
        organizationId: organization?.id || "",
      })
    );
  };

  const updateDocument = (documentId: string, data: any) => {
    z.mutate(
      mutators.document.update({
        documentId,
        organizationId: organization?.id || "",
        ...data,
      })
    );
  };

  return {
    createDocument,
    deleteDocument,
    publishDocument,
    updateDocument,
  };
}
