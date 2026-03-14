import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import type { PopoverProps } from "@lydie/ui/components/generic/Popover";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/atoms/confirm-dialog";

type CollectionMenuProps = {
  collectionId: string;
  collectionName: string;
  organizationSlug: string;
  placement?: PopoverProps["placement"];
};

export function CollectionMenu({
  collectionId,
  collectionName,
  organizationSlug,
  placement = "bottom end",
}: CollectionMenuProps) {
  const z = useZero();
  const { organization } = useOrganization();
  const navigate = useNavigate() as (options: {
    to: string;
    params?: Record<string, string>;
  }) => void;

  const [usages] = useQuery(
    queries.collections.viewUsagesByCollection({
      organizationId: organization.id,
      collectionId,
    }) as any,
  );

  const usageCount = (usages ?? []).length;

  const referencingDocumentTitles = Array.from(
    new Set(
      (usages ?? [])
        .map((usage: any) => usage.document?.title)
        .filter((title: unknown): title is string => typeof title === "string" && title.length > 0),
    ),
  );

  const handleDelete = () => {
    const itemName = collectionName;
    const referencingDocumentsMessage =
      referencingDocumentTitles.length > 0
        ? `\n\nReferenced in:\n${referencingDocumentTitles.map((title) => `- ${title}`).join("\n")}`
        : "";
    const warningMessage =
      usageCount > 0
        ? `This collection is referenced by ${usageCount} view block${usageCount === 1 ? "" : "s"}. If you continue, those blocks will be disconnected from this collection.${referencingDocumentsMessage}`
        : `This collection will be moved to trash. You can restore it later from the trash.`;

    confirmDialog({
      title: `Move "${itemName.length > 16 ? itemName.slice(0, 10) + "..." : itemName}" to trash?`,
      message: warningMessage,
      onConfirm: () => {
        void deleteCollectionWithUndo();
      },
    });
  };

  const deleteCollectionWithUndo = async () => {
    try {
      await z.mutate(
        mutators.collection.delete({
          collectionId,
          organizationId: organization.id,
          force: usageCount > 0,
        }),
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete collection");
      return;
    }

    toast("Collection moved to trash", {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          z.mutate(
            mutators.collection.restore({
              collectionId,
              organizationId: organization.id,
            }),
          );
          toast.success("Collection restored");
        },
      },
    });

    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug },
    });
  };

  return (
    <Menu placement={placement}>
      <MenuItem onAction={handleDelete}>Delete</MenuItem>
    </Menu>
  );
}
