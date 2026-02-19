import type { PropertyDefinition } from "@lydie/core/collection";
import { Button } from "@lydie/ui/components/generic/Button";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PropertyManager } from "@/components/collection";
import { useCollectionTabSync } from "@/components/layout/DocumentTabBar";
import { RecordsTable } from "@/components/modules";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
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
  const z = useZero();
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

  const schema = (collection.properties as PropertyDefinition[] | null) ?? [];
  const routeProperty = schema.find((property) => property.name === "route");
  const [nextHandle, setNextHandle] = useState(collection.handle);
  const [isSavingHandle, setIsSavingHandle] = useState(false);

  useEffect(() => {
    setNextHandle(collection.handle);
  }, [collection.handle]);

  const handleUpdateCollectionHandle = async () => {
    const trimmed = nextHandle.trim();
    if (!trimmed || trimmed === collection.handle) {
      return;
    }

    setIsSavingHandle(true);
    try {
      await z.mutate(
        mutators.collection.update({
          collectionId: collection.id,
          organizationId: organization.id,
          handle: trimmed,
        }),
      );
      toast.success("Collection handle updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update collection handle");
    } finally {
      setIsSavingHandle(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!window.confirm(`Delete collection \"${collection.name}\"?`)) {
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
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{collection.name}</h1>
          {userIsAdmin ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-500">/</span>
              <input
                value={nextHandle}
                onChange={(event) => setNextHandle(event.target.value)}
                className="h-7 rounded border border-gray-300 bg-white px-2 text-sm text-gray-700"
              />
              <Button
                size="sm"
                intent="ghost"
                onPress={() => void handleUpdateCollectionHandle()}
                isDisabled={isSavingHandle || !nextHandle.trim() || nextHandle === collection.handle}
              >
                {isSavingHandle ? "Saving..." : "Save"}
              </Button>
            </div>
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
                  Enable routing to use this collection as a nested route source for external
                  pages.
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

        <RecordsTable
          collectionId={collection.id}
          organizationId={organization.id}
          organizationSlug={organization.slug}
          schema={schema}
        />
      </div>
    </div>
  );
}
