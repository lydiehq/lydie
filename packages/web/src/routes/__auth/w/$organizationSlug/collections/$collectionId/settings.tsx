import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { Form } from "react-aria-components";
import { toast } from "sonner";

import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useAppForm } from "@/hooks/use-app-form";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useZero } from "@/services/zero";
import { isAdmin } from "@/utils/admin";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/collections/$collectionId/settings",
)({
  component: RouteComponent,
  ssr: false,
});

function RouteComponent() {
  const { collectionId } = Route.useParams();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);

  const [collection, status] = useQuery(
    queries.collections.byId({
      organizationId: organization.id,
      collectionId,
    }),
  );

  useDocumentTitle(collection ? `${collection.name} Settings` : "Collection Settings");

  if (!collection && status.type === "complete") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center justify-center gap-y-2">
          <span className="text-sm font-medium text-gray-900">Collection not found</span>
          <Button size="sm" href={`/w/${organization.slug}`}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!collection) {
    return null;
  }

  return (
    <CollectionSettings
      collection={collection}
      organization={organization}
      userIsAdmin={userIsAdmin}
    />
  );
}

interface CollectionSettingsProps {
  collection: {
    id: string;
    name: string;
    handle: string;
  };
  organization: {
    id: string;
    slug: string;
  };
  userIsAdmin: boolean;
}

function CollectionSettings({ collection, organization, userIsAdmin }: CollectionSettingsProps) {
  const z = useZero();
  const [usages] = useQuery(
    queries.collections.viewUsagesByCollection({
      organizationId: organization.id,
      collectionId: collection.id,
    }) as any,
  );
  const usageCount = (usages ?? []).length;

  const handleForm = useAppForm({
    defaultValues: {
      handle: collection.handle,
    },
    onSubmit: async ({ value }) => {
      const trimmed = value.handle.trim();
      if (!trimmed || trimmed === collection.handle) {
        return;
      }

      try {
        await z.mutate(
          mutators.collection.update({
            collectionId: collection.id,
            organizationId: organization.id,
            handle: trimmed,
          }),
        );
        toast.success("Collection handle updated");
        handleForm.reset();
      } catch (error) {
        console.error(error);
        toast.error("Failed to update collection handle");
      }
    },
  });

  const handleDeleteCollection = async () => {
    const warning =
      usageCount > 0
        ? `This collection is referenced by ${usageCount} view block${usageCount === 1 ? "" : "s"}. Remove those references first.`
        : "This action cannot be undone.";

    if (!window.confirm(`Delete collection "${collection.name}"?\n\n${warning}`)) {
      return;
    }

    try {
      await z.mutate(
        mutators.collection.delete({
          collectionId: collection.id,
          organizationId: organization.id,
        }),
      );
      toast.success("Collection deleted");
      window.location.assign(`/w/${organization.slug}`);
    } catch (error) {
      console.error(error);
      toast.error("This collection is still referenced by one or more views");
    }
  };

  if (!userIsAdmin) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>Settings</Heading>
        </div>
        <Separator />
        <div className="text-sm text-gray-500">
          You don't have permission to manage this collection.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level={1}>Collection Settings</Heading>
          <p className="text-sm text-gray-500 mt-1">{collection.name}</p>
        </div>
        <Button
          intent="ghost"
          size="sm"
          href={`/w/${organization.slug}/collections/${collection.id}`}
        >
          Back to collection
        </Button>
      </div>
      <Separator />

      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="Handle"
          description="The handle is used in URLs to identify this collection."
        />
        <Form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleForm.handleSubmit();
          }}
        >
          <div className="flex-1 max-w-md">
            <handleForm.AppField
              name="handle"
              children={(field) => <field.TextField label="Handle" />}
            />
          </div>
          <handleForm.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
              handleValue: state.values.handle,
            })}
            children={({ canSubmit, isSubmitting, handleValue }) => (
              <Button
                size="sm"
                type="submit"
                isDisabled={!canSubmit || handleValue.trim() === collection.handle}
              >
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            )}
          />
        </Form>
      </div>

      <Separator />

      <div className="flex flex-col gap-y-4">
        <SectionHeader heading="Danger Zone" description="Irreversible and destructive actions." />
        <Button
          intent="ghost"
          size="sm"
          onPress={() => void handleDeleteCollection()}
          className="w-fit text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          Delete collection
        </Button>
      </div>
    </div>
  );
}
