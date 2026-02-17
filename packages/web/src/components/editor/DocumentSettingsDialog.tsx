import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { Heading } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
};

export function DocumentSettingsDialog({ isOpen, onOpenChange, doc }: Props) {
  const z = useZero();
  const { organization } = useOrganization();

  const handlePublish = async () => {
    z.mutate(
      mutators.document.publish({
        documentId: doc.id,
        organizationId: organization.id,
      }),
    );
  };

  const handleUnpublish = async () => {
    z.mutate(
      mutators.document.unpublish({
        documentId: doc.id,
        organizationId: organization.id,
      }),
    );
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Dialog>
        <div className="p-3">
          <Heading slot="title" className="text-sm font-medium text-gray-700">
            Document Settings
          </Heading>
        </div>
        <Separator />
        <div className="p-3 space-y-4">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Publishing Status</h4>
              <p className="text-sm text-gray-500">
                {doc.published
                  ? "This document is published and available through the API"
                  : "This document is a draft and not available through the API"}
              </p>
            </div>

            <div className="flex justify-end items-center gap-2">
              {doc.published && (
                <Button size="sm" intent="secondary" onPress={handleUnpublish}>
                  Unpublish
                </Button>
              )}
              <Button size="sm" intent="primary" onPress={handlePublish}>
                {doc.published ? "Republish" : "Publish"}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}
