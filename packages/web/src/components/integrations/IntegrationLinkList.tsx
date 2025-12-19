import { Menu, MenuItem } from "@/components/generic/Menu";
import {
  Button as RACButton,
  Heading as RACHeading,
  MenuTrigger,
  DialogTrigger,
} from "react-aria-components";
import { MoreHorizontal, LinkIcon } from "lucide-react";
import { useZero } from "@rocicorp/zero/react";
import { mutators } from "@lydie/zero/mutators";
import { useOrganization } from "@/context/organization.context";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { formatDistanceToNow } from "date-fns";
import { useAuthenticatedApi } from "@/services/api";
import { Button } from "../generic/Button";
import { Modal } from "../generic/Modal";
import { Dialog } from "../generic/Dialog";
import { useState } from "react";
import { useQuery } from "@rocicorp/zero/react";
import { toast } from "sonner";
import { createId } from "@lydie/core/id";
import {
  GitHubForm,
  ShopifyForm,
  WordPressForm,
  type IntegrationLinkConfig,
} from "./forms";

type Props = {
  links: QueryResultType<typeof queries.integrationLinks.byIntegrationType>;
  integrationType: string;
  organizationId: string;
};

export function IntegrationLinkList({
  links,
  integrationType,
  organizationId,
}: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const zero = useZero();

  const [connections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organizationId || "",
    })
  );

  const connection = connections.find(
    (c) => c.integration_type === integrationType
  );

  const handleCreateLink = async (
    name: string,
    config: IntegrationLinkConfig
  ) => {
    if (!connection) {
      toast.error("No connection found");
      return;
    }

    try {
      const write = zero.mutate(
        mutators.integration.createLink({
          id: createId(),
          connectionId: connection.id,
          organizationId,
          name,
          config,
        })
      );

      await write.server;

      toast.success("Link created successfully");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to create link:", error);
      toast.error("Failed to create link");
      throw error;
    }
  };

  const renderForm = () => {
    if (!connection) return null;

    const formProps = {
      connectionId: connection.id,
      organizationId,
      onCreate: handleCreateLink,
      onCancel: () => setIsDialogOpen(false),
    };

    // Todo: can we dynamically load this? even better, we should load it from
    // the integration itself or have a schema for defining the form?
    switch (integrationType) {
      case "github":
        return <GitHubForm {...formProps} />;
      case "shopify":
        return <ShopifyForm {...formProps} />;
      case "wordpress":
        return <WordPressForm {...formProps} />;
      default:
        return (
          <div className="p-4">
            <p className="text-sm text-gray-600">
              Form not available for this integration type.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="bg-black/2 rounded-lg p-1 flex flex-col gap-y-1">
      <div className="flex justify-between items-center p-0.5">
        <div></div>
        <div>
          {connection && (
            <DialogTrigger isOpen={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <Button size="sm" intent="secondary">
                <LinkIcon className="size-3.5 mr-1" />
                Add Link
              </Button>
              <Modal isDismissable>
                <Dialog>
                  <div className="p-4">{renderForm()}</div>
                </Dialog>
              </Modal>
            </DialogTrigger>
          )}
        </div>
      </div>
      {links.length > 0 ? (
        <div className="w-full rounded-lg ring ring-black/8 bg-white divide-y divide-black/6">
          <ul className="divide-y divide-black/6">
            {links.map((link) => (
              <IntegrationLinkListItem key={link.id} link={link} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="w-full rounded-lg ring ring-black/8 bg-white p-8">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">No links yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Add a link to start syncing documents.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

type IntegrationLinkListItemProps = {
  link: QueryResultType<
    typeof queries.integrationLinks.byIntegrationType
  >[number];
};

export function IntegrationLinkListItem({
  link,
}: IntegrationLinkListItemProps) {
  const client = useAuthenticatedApi();

  const onSync = async () => {
    const apiClient = await client.createClient();
    // TODO: maybe handle via Zero mutator
    // better UI feedback for pull
    await apiClient.internal.integrations.links[":linkId"].pull
      .$post({
        param: { linkId: link.id },
      })
      .then((res: Response) => res.json());
  };

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  return (
    <ul className="p-2.5 hover:bg-black/1 first:rounded-t-lg last:rounded-b-lg transition-colors duration-75">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{link.name}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-sm text-gray-600 min-w-[120px]">
          Last synced:
          {link.last_synced_at
            ? formatDistanceToNow(link.last_synced_at)
            : "Never"}
        </div>
        <MenuTrigger>
          <RACButton>
            <MoreHorizontal className="size-4 text-gray-500" />
          </RACButton>
          <Menu>
            <MenuItem onAction={onSync}>Resync</MenuItem>
            <MenuItem onAction={() => setIsDeleteDialogOpen(true)}>
              Delete
            </MenuItem>
          </Menu>
        </MenuTrigger>
        <DeleteLinkDialog
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          link={link}
        />
      </div>
    </ul>
  );
}

type DeleteLinkDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  link: QueryResultType<
    typeof queries.integrationLinks.byIntegrationType
  >[number];
};

function DeleteLinkDialog({
  isOpen,
  onOpenChange,
  link,
}: DeleteLinkDialogProps) {
  const zero = useZero();
  const { organization } = useOrganization();

  const handleConfirm = () => {
    zero.mutate(
      mutators.integration.deleteLink({
        linkId: link.id,
        organizationId: organization?.id || "",
        deleteDocuments: true,
      })
    );
  };

  const hasDocuments = link.documents.length > 0;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable size="sm">
      <Dialog role="alertdialog">
        <div className="p-4 flex flex-col gap-y-3">
          <RACHeading
            slot="title"
            className="text-lg font-medium text-gray-900"
          >
            Confirm
          </RACHeading>
          <p className="text-sm text-slate-600">
            {hasDocuments
              ? "The link you're trying to delete has existing documents which will be deleted, do you want to continue?"
              : "Are you sure you want to delete this link?"}
          </p>
          <div className="flex gap-x-1.5 justify-end">
            <Button
              intent="secondary"
              onPress={() => onOpenChange(false)}
              size="sm"
            >
              Cancel
            </Button>
            <Button onPress={handleConfirm} size="sm" autoFocus>
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}
