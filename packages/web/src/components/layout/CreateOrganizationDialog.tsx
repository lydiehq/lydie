import { Modal } from "../generic/Modal";
import { Dialog } from "../generic/Dialog";
import { Form, Heading } from "react-aria-components";
import { useAppForm } from "@/hooks/use-app-form";
import { Button } from "../generic/Button";
import { slugify } from "@lydie/core/utils";
import { Separator } from "../generic/Separator";
import { authClient } from "@/utils/auth";
import { useNavigate } from "@tanstack/react-router";
import { setActiveOrganizationSlug } from "@/lib/active-organization";
import { useAuth } from "@/context/auth.context";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function CreateOrganizationDialog({ isOpen, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.userId;

  const form = useAppForm({
    defaultValues: {
      name: "",
      slug: "",
    },
    onSubmit: async (values) => {
      try {
        const result = await authClient.organization.create({
          name: values.value.name,
          slug: values.value.slug,
        });

        const organizationSlug = values.value.slug;

        // Set the active organization for this user
        setActiveOrganizationSlug(organizationSlug, userId);

        onOpenChange(false);

        navigate({
          to: "/w/$organizationSlug",
          params: { organizationSlug },
        });
      } catch (error) {
        console.error("Failed to create organization:", error);
      }
    },
  });

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
              Create New Organization
            </Heading>
          </div>
          <Separator />
          <div className="p-3 space-y-4">
            <form.AppField
              name="name"
              listeners={{
                onChange: (e) => {
                  // Auto-generate slug from name if slug is empty or matches previous name
                  const currentSlug = form.getFieldValue("slug");
                  const previousName = form.getFieldValue("name");

                  if (!currentSlug || slugify(previousName) === currentSlug) {
                    form.setFieldValue("slug", slugify(e.value));
                  }
                },
              }}
              children={(field) => (
                <field.TextField
                  label="Organization Name"
                  description="The display name for your organization"
                />
              )}
            />
            <form.AppField
              name="slug"
              listeners={{
                onBlur: (e) => {
                  const slugified = slugify(e.value);
                  form.setFieldValue("slug", slugified);
                },
              }}
              children={(field) => (
                <field.TextField
                  label="Organization URL"
                  description="This will be used in the URL of your organization"
                />
              )}
            />
            <Button type="submit" isPending={form.state.isSubmitting}>
              {form.state.isSubmitting ? "Creating..." : "Create Organization"}
            </Button>
          </div>
        </Form>
      </Dialog>
    </Modal>
  );
}
