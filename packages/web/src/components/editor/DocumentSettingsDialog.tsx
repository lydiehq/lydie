import { Modal } from "../generic/Modal";
import { Dialog } from "../generic/Dialog";
import { Form, Heading } from "react-aria-components";
import { useZero } from "@/services/zero";
import { useAppForm } from "@/hooks/use-app-form";
import { Button } from "../generic/Button";
import { slugify } from "@lydie/core/utils";
import { Separator } from "../generic/Separator";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { mutators } from "@lydie/zero/mutators";
import { useOrganization } from "@/context/organization.context";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
};

export function DocumentSettingsDialog({ isOpen, onOpenChange, doc }: Props) {
  const z = useZero();
  const { organization } = useOrganization();

  const form = useAppForm({
    defaultValues: {
      slug: doc.slug,
    },
    onSubmit: async ({ value }) => {
      z.mutate(
        mutators.document.update({
          documentId: doc.id,
          organizationId: organization.id,
          slug: value.slug,
        })
      );

      onOpenChange(false);
    },
  });

  const handlePublish = async () => {
    z.mutate(
      mutators.document.update({
        documentId: doc.id,
        organizationId: organization.id,
        published: true,
      })
    );
  };

  const handleUnpublish = async () => {
    z.mutate(
      mutators.document.update({
        documentId: doc.id,
        organizationId: organization.id,
        published: false,
      })
    );
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Dialog>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="p-3">
            <Heading slot="title" className="text-sm font-medium text-gray-700">
              Document Settings
            </Heading>
          </div>
          <Separator />
          <div className="p-3 space-y-4">
            <form.AppField
              name="slug"
              listeners={{
                onBlur: (e) => {
                  console.log("onBlur", e.value);
                  const slugified = slugify(e.value);
                  form.setFieldValue("slug", slugified);
                },
              }}
              children={(field) => (
                <field.TextField
                  label="Document Slug"
                  description="This will be used in the URL of your document"
                />
              )}
            />

            <Separator />

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">
                  Publishing Status
                </h4>
                <p className="text-sm text-gray-500">
                  {doc.published
                    ? "This document is published and available through the API"
                    : "This document is a draft and not available through the API"}
                </p>
              </div>

              <div className="flex justify-between items-center gap-2">
                <Button type="submit" size="sm">
                  Save Settings
                </Button>
                <div className="flex gap-2">
                  {doc.published && (
                    <Button
                      size="sm"
                      intent="secondary"
                      onPress={handleUnpublish}
                    >
                      Unpublish
                    </Button>
                  )}
                  <Button size="sm" intent="primary" onPress={handlePublish}>
                    {doc.published ? "Republish" : "Publish"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Form>
      </Dialog>
    </Modal>
  );
}
