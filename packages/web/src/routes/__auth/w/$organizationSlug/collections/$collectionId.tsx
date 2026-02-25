import { SettingsRegular } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Input } from "@lydie/ui/components/generic/Field";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import { useCollectionTabSync } from "@/components/layout/DocumentTabBar";
import { CollectionTable } from "@/components/modules";
import { CollectionKanban } from "@/components/modules/CollectionKanban";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";
import { isAdmin } from "@/utils/admin";

import { resolveSelectedViewId, type CollectionViewRecord } from "./view-selection";

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
  const [name, setName] = useState(collection.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewType, setNewViewType] = useState<"table" | "list" | "kanban">("table");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  const [views] = useQuery(
    queries.collections.viewsByCollection({
      organizationId: organization.id,
      collectionId: collection.id,
    }),
  );
  const viewRecords = ((views ?? []) as Array<{ id: string; name: string; type: string }>).filter(
    (view) => view.type === "table" || view.type === "list" || view.type === "kanban",
  ) as CollectionViewRecord[];

  useEffect(() => {
    const nextSelectedViewId = resolveSelectedViewId(selectedViewId, viewRecords);
    if (nextSelectedViewId !== selectedViewId) {
      setSelectedViewId(nextSelectedViewId);
    }
  }, [selectedViewId, viewRecords]);

  const selectedView = useMemo(
    () => viewRecords.find((view) => view.id === selectedViewId) ?? null,
    [selectedViewId, viewRecords],
  );

  const saveName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === collection.name) {
      return;
    }

    setIsSavingName(true);
    try {
      await z.mutate(
        mutators.collection.update({
          collectionId: collection.id,
          organizationId: organization.id,
          name: trimmed,
        }),
      );
      toast.success("Collection name updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update collection name");
      setName(collection.name);
    } finally {
      setIsSavingName(false);
    }
  }, [name, collection.id, collection.name, organization.id, z]);

  const handleCreateRow = useCallback(() => {
    void z.mutate(
      mutators.document.create({
        id: createId(),
        organizationId: organization.id,
        collectionId: collection.id,
        title: "",
      }),
    );
  }, [collection.id, organization.id, z]);

  const handleCreateView = useCallback(async () => {
    const trimmed = newViewName.trim();
    if (!trimmed) {
      toast.error("View name is required");
      return;
    }

    try {
      await z.mutate(
        mutators.collection.createView({
          organizationId: organization.id,
          collectionId: collection.id,
          name: trimmed,
          type: newViewType,
        }),
      );
      setNewViewName("");
      setNewViewType("table");
      setSelectedViewId(null);
      toast.success("View created");
    } catch (error) {
      console.error(error);
      toast.error("Failed to create view");
    }
  }, [collection.id, newViewName, newViewType, organization.id, z]);

  const handleDeleteView = useCallback(
    async (viewId: string) => {
      try {
        await z.mutate(
          mutators.collection.deleteView({
            viewId,
            organizationId: organization.id,
          }),
        );
        toast.success("View deleted");
      } catch (error) {
        console.error(error);
        toast.error("Failed to delete view");
      }
    },
    [organization.id, z],
  );

  const handleUpdateViewType = useCallback(
    async (viewId: string, type: "table" | "list" | "kanban") => {
      try {
        await z.mutate(
          mutators.collection.updateView({
            viewId,
            organizationId: organization.id,
            type,
          }),
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to update view type");
      }
    },
    [organization.id, z],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-black/6 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          {userIsAdmin ? (
            <TextField
              value={name}
              onChange={setName}
              aria-label="Collection name"
              className="flex items-center gap-2"
              onBlur={() => void saveName()}
            >
              <Input
                className="
                  text-xl font-semibold text-gray-900 p-0 min-w-0 flex-1
                  border-0 !border-0 bg-transparent !bg-transparent
                  outline-none !outline-none ring-0 !ring-0
                  focus:border-0 focus:!border-0 focus:ring-0 focus:!ring-0
                  focus:outline-none focus:!outline-none
                  shadow-none !shadow-none
                "
              />
            </TextField>
          ) : (
            <h1 className="text-xl font-semibold text-gray-900">{collection.name}</h1>
          )}
          <p className="text-sm text-gray-500 mt-1">
            /{collection.handle}
            {isSavingName && <span className="ml-2 text-gray-400">Saving...</span>}
          </p>
        </div>
        {userIsAdmin && (
          <Button
            intent="ghost"
            size="sm"
            href={`/w/${organization.slug}/collections/${collection.id}/settings`}
          >
            <SettingsRegular className="w-4 h-4 mr-1" />
            Settings
          </Button>
        )}
      </div>

      <div className="px-6 py-4 space-y-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Views</h2>
            <p className="text-xs text-gray-500">Manage reusable views for this collection.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              value={newViewName}
              onChange={(event) => setNewViewName(event.target.value)}
              placeholder="View name"
              className="min-w-48 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
            />
            <select
              value={newViewType}
              onChange={(event) =>
                setNewViewType(event.target.value as "table" | "list" | "kanban")
              }
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="table">Table</option>
              <option value="list">List</option>
              <option value="kanban">Kanban</option>
            </select>
            <Button intent="secondary" size="sm" onPress={handleCreateView}>
              + New view
            </Button>
          </div>

          <div className="space-y-2">
            {viewRecords.map((view) => (
              <div
                key={view.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => setSelectedViewId(view.id)}
                  className={`min-w-0 text-left ${selectedViewId === view.id ? "text-blue-700" : "text-gray-900"}`}
                >
                  <div className="truncate text-sm font-medium">{view.name}</div>
                  <div className="text-xs text-gray-500">{view.id}</div>
                </button>
                <div className="flex items-center gap-2">
                  <select
                    value={view.type}
                    onChange={(event) =>
                      void handleUpdateViewType(
                        view.id,
                        event.target.value as "table" | "list" | "kanban",
                      )
                    }
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value="table">Table</option>
                    <option value="list">List</option>
                    <option value="kanban">Kanban</option>
                  </select>
                  <Button
                    intent="ghost"
                    size="sm"
                    onPress={() => void handleDeleteView(view.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button intent="secondary" size="sm" onPress={handleCreateRow}>
          + New
        </Button>
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            {selectedView?.type === "kanban" ? (
              <CollectionKanban
                collectionId={collection.id}
                organizationId={organization.id}
                organizationSlug={organization.slug}
                schema={schema}
              />
            ) : (
              <CollectionTable
                collectionId={collection.id}
                organizationId={organization.id}
                organizationSlug={organization.slug}
                schema={schema}
                showCreateRowButton={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
