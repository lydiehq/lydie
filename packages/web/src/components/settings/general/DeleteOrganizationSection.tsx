import { DialogTrigger } from "react-aria-components";

import { AlertDialog } from "@/components/generic/AlertDialog";
import { Button } from "@/components/generic/Button";
import { Modal } from "@/components/generic/Modal";
import { SectionHeader } from "@/components/generic/SectionHeader";

type DeleteOrganizationSectionProps = {
  isDeleteDialogOpen: boolean;
  onDeleteDialogOpenChange: (isOpen: boolean) => void;
  onDelete: () => void;
};

export function DeleteOrganizationSection({
  isDeleteDialogOpen,
  onDeleteDialogOpenChange,
  onDelete,
}: DeleteOrganizationSectionProps) {
  return (
    <>
      <div className="flex flex-col gap-y-4">
        <SectionHeader heading="Danger Zone" description="Irreversible and destructive actions." />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-y-2">
            <div className="flex flex-col gap-y-0.5">
              <h3 className="text-sm font-medium text-red-900">Delete workspace</h3>
              <p className="text-sm text-red-700">
                Once you delete an organization, there is no going back. This will permanently
                delete the organization and all associated data, including documents, API keys, and
                settings.
              </p>
            </div>
            <div className="flex justify-end">
              <Button intent="danger" size="sm" onPress={() => onDeleteDialogOpenChange(true)}>
                Delete Organization
              </Button>
            </div>
          </div>
        </div>
      </div>

      <DialogTrigger isOpen={isDeleteDialogOpen} onOpenChange={onDeleteDialogOpenChange}>
        <Modal isDismissable>
          <AlertDialog
            title="Delete Organization"
            variant="destructive"
            actionLabel="Delete Organization"
            cancelLabel="Cancel"
            onAction={onDelete}
          >
            Are you absolutely sure you want to delete this organization? This action cannot be
            undone. This will permanently delete the organization and all associated data,
            including:
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li>All documents</li>
              <li>All API keys</li>
              <li>All organization settings</li>
              <li>All conversations and messages</li>
              <li>All other associated data</li>
            </ul>
          </AlertDialog>
        </Modal>
      </DialogTrigger>
    </>
  );
}
