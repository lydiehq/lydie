import type { PropertyDefinition } from "@lydie/core/collection";
import { Button } from "@lydie/ui/components/generic/Button";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { Form } from "react-aria-components";
import { toast } from "sonner";

import { PropertyManager } from "@/components/collection";
import { useCollectionTabSync } from "@/components/layout/DocumentTabBar";
import { CollectionTable } from "@/components/modules";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useAppForm } from "@/hooks/use-app-form";
import { useZero } from "@/services/zero";
import { isAdmin } from "@/utils/admin";

export const Route = createFileRoute("/__auth/w/$organizationSlug/collections/$collectionId")({
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

  useCollectionTabSync(collection?.id, collection?.name);

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
    <CollectionPage collection={collection} organization={organization} userIsAdmin={userIsAdmin} />
  );
}

interface CollectionPageProps {
  collection: {
    id: string;
    name: string;
    handle: string;
    properties: unknown;
  };
  organization: {
    id: string;
    slug: string;
  };
  userIsAdmin: boolean;
}

function CollectionPage({ collection, organization, userIsAdmin }: CollectionPageProps) {
  const z = useZero();
  const schema = (collection.properties as PropertyDefinition[] | null) ?? [];
  const routeProperty = schema.find((property) => property.name === "route");

  const nameForm = useAppForm({
    defaultValues: {
      name: collection.name,
    },
    onSubmit: async ({ value }) => {
      const trimmed = value.name.trim();
      if (!trimmed || trimmed === collection.name) {
        return;
      }

      try {
        await z.mutate(
          mutators.collection.update({
            collectionId: collection.id,
            organizationId: organization.id,
            name: trimmed,
          }),
        );
        toast.success("Collection name updated");
        nameForm.reset();
      } catch (error) {
        console.error(error);
        toast.error("Failed to update collection name");
      }
    },
  });

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
    if (!window.confirm(`Delete collection "${collection.name}"?`)) {
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
      toast.error("Failed to delete collection");
    }
  };

  const handleEnableRouting = async () => {
    if (routeProperty) {
      return;
    }

    try {
      await z.mutate(
        mutators.collection.update({
          collectionId: collection.id,
          organizationId: organization.id,
          properties: [
            ...schema,
            {
              name: "route",
              type: "text",
              required: true,
              unique: true,
            },
          ],
        }),
      );
      toast.success("Routing enabled. Add route values like /, /getting-started, /guides/intro");
    } catch (error) {
      console.error(error);
      toast.error("Failed to enable routing");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-black/6 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          {userIsAdmin ? (
            <Form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                nameForm.handleSubmit();
              }}
            >
              <nameForm.AppField
                name="name"
                children={(field) => (
                  <field.TextField
                    aria-label="Collection name"
                    className="text-xl font-semibold text-gray-900 border-0 bg-transparent p-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 [&_input]:text-xl [&_input]:font-semibold [&_input]:p-0 [&_input]:border-0 [&_input]:bg-transparent"
                  />
                )}
              />
              <nameForm.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                  nameValue: state.values.name,
                })}
                children={({ canSubmit, isSubmitting, nameValue }) => (
                  <Button
                    size="sm"
                    intent="ghost"
                    type="submit"
                    isDisabled={!canSubmit || nameValue.trim() === collection.name}
                  >
                    {isSubmitting ? "Saving..." : "Save"}
                  </Button>
                )}
              />
            </Form>
          ) : (
            <h1 className="text-xl font-semibold text-gray-900">{collection.name}</h1>
          )}
          {userIsAdmin ? (
            <Form
              className="mt-1 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleForm.handleSubmit();
              }}
            >
              <span className="text-sm text-gray-500">/</span>
              <handleForm.AppField
                name="handle"
                children={(field) => (
                  <field.TextField
                    aria-label="Collection handle"
                    className="h-7 rounded border border-gray-300 bg-white px-2 text-sm text-gray-700 [&_input]:p-0 [&_input]:border-0 [&_input]:bg-transparent"
                  />
                )}
              />
              <handleForm.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                  handleValue: state.values.handle,
                })}
                children={({ canSubmit, isSubmitting, handleValue }) => (
                  <Button
                    size="sm"
                    intent="ghost"
                    type="submit"
                    isDisabled={!canSubmit || handleValue.trim() === collection.handle}
                  >
                    {isSubmitting ? "Saving..." : "Save"}
                  </Button>
                )}
              />
            </Form>
          ) : (
            <p className="text-sm text-gray-500">/{collection.handle}</p>
          )}
        </div>
        {userIsAdmin && (
          <Button intent="ghost" size="sm" onPress={() => void handleDeleteCollection()}>
            Delete collection
          </Button>
        )}
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="rounded-xl border border-black/8 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Routing</h2>
              {routeProperty ? (
                <p className="mt-1 text-sm text-gray-600">
                  Routing is enabled through the <code>route</code> field. Manage paths directly in
                  the table (e.g. <code>/</code>, <code>/getting-started</code>,
                  <code>/guides/intro</code>).
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-600">
                  Enable routing to use this collection as a nested route source for external pages.
                </p>
              )}
            </div>

            {userIsAdmin && !routeProperty && (
              <Button intent="ghost" size="sm" onPress={() => void handleEnableRouting()}>
                Enable routing
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-black/8 p-4 space-y-4">
          <PropertyManager
            collectionId={collection.id}
            organizationId={organization.id}
            schema={schema}
            isAdmin={userIsAdmin}
          />
        </div>

        <CollectionTable
          collectionId={collection.id}
          organizationId={organization.id}
          organizationSlug={organization.slug}
          schema={schema}
        />
      </div>
    </div>
  );
}
