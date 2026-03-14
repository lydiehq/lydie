import { Add16Filled, SettingsRegular } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Button } from "@lydie/ui/components/generic/Button";
import { Input } from "@lydie/ui/components/generic/Field";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import { useCollectionTabSync } from "@/components/layout/DocumentTabBar";
import { CollectionKanbanView } from "@/components/collections/CollectionKanbanView";
import { CollectionTableView } from "@/components/collections/CollectionTableView";
import {
  CollectionViewTabMenu,
  CollectionViewTabs,
  type CollectionViewType,
} from "@/components/collections/CollectionViewTabs";
import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

import { resolveSelectedViewId, type CollectionViewRecord } from "./-view-selection";

export const Route = createFileRoute("/__auth/w/$organizationSlug/collections/$collectionId")({
  component: RouteComponent,
  ssr: false,
});

function RouteComponent() {
  const { collectionId } = Route.useParams();
  const { organization } = useOrganization();
  const matchRoute = useMatchRoute();

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

  if (matchRoute({ to: "/w/$organizationSlug/collections/$collectionId/settings" })) {
    return <Outlet />;
  }

  return (
    <CollectionPage collection={collection} organization={organization} />
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
}

function CollectionPage({ collection, organization }: CollectionPageProps) {
  const z = useZero();
  const schema = (collection.properties as PropertyDefinition[] | null) ?? [];
  const lookupKey = schema.find((property) => property.unique)?.name ?? null;
  const indexedFields = schema.filter((property) => property.indexed).map((property) => property.name);
  const [name, setName] = useState(collection.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [viewEditorState, setViewEditorState] = useState<
    | {
        mode: "create";
      }
    | {
        mode: "edit";
        viewId: string;
      }
    | null
  >(null);
  const [viewEditorName, setViewEditorName] = useState("");
  const [viewEditorType, setViewEditorType] = useState<CollectionViewType>("table");
  const [viewEditorFilterField, setViewEditorFilterField] = useState("");
  const [viewEditorFilterValue, setViewEditorFilterValue] = useState("");
  const [viewEditorSortField, setViewEditorSortField] = useState("");
  const [viewEditorSortDirection, setViewEditorSortDirection] = useState<"asc" | "desc">("asc");

  const [views] = useQuery(
    queries.collections.viewsByCollection({
      organizationId: organization.id,
      collectionId: collection.id,
    }),
  );
  const viewRecords = (
    (views ?? []) as Array<{
      id: string;
      name: string;
      type: string;
      config?: {
        filters?: Record<string, string | number | boolean>;
        sortField?: string | null;
        sortDirection?: "asc" | "desc" | null;
      };
    }>
  )
    .filter((view) => view.type === "table" || view.type === "list" || view.type === "kanban")
    .map((view) => ({
      ...view,
      type: (view.type === "list" ? "table" : view.type) as CollectionViewRecord["type"],
    }));

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

  const sortableFields = schema.map((property) => property.name);

  const openCreateViewEditor = useCallback(() => {
    setViewEditorState({ mode: "create" });
    setViewEditorName(`View ${viewRecords.length + 1}`);
    setViewEditorType("table");
    setViewEditorFilterField("");
    setViewEditorFilterValue("");
    setViewEditorSortField("");
    setViewEditorSortDirection("asc");
  }, [viewRecords.length]);

  const openEditViewEditor = useCallback(
    (viewId: string) => {
      const view = viewRecords.find((entry) => entry.id === viewId);
      if (!view) {
        return;
      }

      const filters = view.config?.filters ?? {};
      const [firstFilterField, firstFilterValue] = Object.entries(filters)[0] ?? ["", ""];

      setViewEditorState({ mode: "edit", viewId: view.id });
      setViewEditorName(view.name);
      setViewEditorType(view.type);
      setViewEditorFilterField(firstFilterField);
      setViewEditorFilterValue(String(firstFilterValue ?? ""));
      setViewEditorSortField(view.config?.sortField ?? "");
      setViewEditorSortDirection(view.config?.sortDirection === "desc" ? "desc" : "asc");
    },
    [viewRecords],
  );

  const closeViewEditor = useCallback(() => {
    setViewEditorState(null);
  }, []);

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

  const handleSaveView = useCallback(async () => {
    const trimmed = viewEditorName.trim();
    if (!trimmed) {
      toast.error("View name is required");
      return;
    }

    const filters =
      viewEditorFilterField.trim() && viewEditorFilterValue.trim()
        ? { [viewEditorFilterField.trim()]: viewEditorFilterValue.trim() }
        : {};
    const sortField = viewEditorSortField.trim() || null;
    const sortDirection = sortField ? viewEditorSortDirection : null;

    try {
      if (viewEditorState?.mode === "create") {
        const viewId = createId();
        await z.mutate(
          mutators.collection.createView({
            viewId,
            organizationId: organization.id,
            collectionId: collection.id,
            name: trimmed,
            type: viewEditorType,
            filters,
            sortField,
            sortDirection,
          }),
        );
        setSelectedViewId(viewId);
        toast.success("View created");
      }

      if (viewEditorState?.mode === "edit") {
        await z.mutate(
          mutators.collection.updateView({
            viewId: viewEditorState.viewId,
            organizationId: organization.id,
            name: trimmed,
            type: viewEditorType,
            filters,
            sortField,
            sortDirection,
          }),
        );
        toast.success("View updated");
      }

      closeViewEditor();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save view");
    }
  }, [
    closeViewEditor,
    collection.id,
    organization.id,
    viewEditorFilterField,
    viewEditorFilterValue,
    viewEditorName,
    viewEditorSortDirection,
    viewEditorSortField,
    viewEditorState,
    viewEditorType,
    z,
  ]);

  const handleDeleteView = useCallback(
    async (viewId: string) => {
      if (viewRecords.length <= 1) {
        toast.error("A collection must have at least one view");
        return;
      }

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
    [organization.id, viewRecords.length, z],
  );

  const handleUpdateViewType = useCallback(
    async (viewId: string, type: CollectionViewType) => {
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
          <p className="text-sm text-gray-500 mt-1">
            /{collection.handle}
            {isSavingName && <span className="ml-2 text-gray-400">Saving...</span>}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            API lookup: {lookupKey ?? "id"} · Indexed: {indexedFields.length > 0 ? indexedFields.join(", ") : "none"}
          </p>
        </div>
        <Button
          intent="ghost"
          size="sm"
          href={`/w/${organization.slug}/collections/${collection.id}/settings`}
        >
          <SettingsRegular className="w-4 h-4 mr-1" />
          Settings
        </Button>
      </div>

      <div className="px-6 py-4 space-y-2">
        <CollectionViewTabs
          views={viewRecords}
          selectedViewId={selectedViewId}
          onSelectView={setSelectedViewId}
          renderViewActions={(view) => (
            <CollectionViewTabMenu
              key={view.id}
              view={view}
              canDelete={viewRecords.length > 1}
              onOpenEditor={openEditViewEditor}
              onChangeType={(viewId, type) => void handleUpdateViewType(viewId, type)}
              onDelete={(viewId) => void handleDeleteView(viewId)}
            />
          )}
          endSlot={
            <button
              type="button"
              onClick={openCreateViewEditor}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
            >
              <Add16Filled className="size-3.5" />
              New view
            </button>
          }
        />

        <Button intent="secondary" size="sm" onPress={handleCreateRow}>
          + New entry
        </Button>
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            {selectedView?.type === "kanban" ? (
              <CollectionKanbanView
                collectionId={collection.id}
                organizationId={organization.id}
                organizationSlug={organization.slug}
                schema={schema}
              />
            ) : (
              <CollectionTableView
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

      <Modal isOpen={viewEditorState !== null} onOpenChange={(isOpen) => !isOpen && closeViewEditor()} size="sm">
        <Dialog>
          <div className="p-4 flex flex-col gap-y-3">
            <h2 className="text-base font-medium text-gray-900">
              {viewEditorState?.mode === "create" ? "Create view" : "Edit view"}
            </h2>
            <label htmlFor="collection-view-editor-name" className="flex flex-col gap-1 text-sm text-gray-700">
              Name
              <Input
                id="collection-view-editor-name"
                value={viewEditorName}
                onChange={(event) => setViewEditorName(event.target.value)}
                placeholder="View name"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-gray-700">
              Layout
              <select
                value={viewEditorType}
                onChange={(event) => setViewEditorType(event.target.value as CollectionViewType)}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
              >
                <option value="table">Table</option>
                <option value="kanban">Board</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Filter field
                <select
                  value={viewEditorFilterField}
                  onChange={(event) => setViewEditorFilterField(event.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
                >
                  <option value="">None</option>
                  {sortableFields.map((fieldName) => (
                    <option key={fieldName} value={fieldName}>
                      {fieldName}
                    </option>
                  ))}
                </select>
              </label>
              <label
                htmlFor="collection-view-editor-filter-value"
                className="flex flex-col gap-1 text-sm text-gray-700"
              >
                Filter value
                <Input
                  id="collection-view-editor-filter-value"
                  value={viewEditorFilterValue}
                  onChange={(event) => setViewEditorFilterValue(event.target.value)}
                  placeholder="e.g. draft"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Sort field
                <select
                  value={viewEditorSortField}
                  onChange={(event) => setViewEditorSortField(event.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
                >
                  <option value="">None</option>
                  {sortableFields.map((fieldName) => (
                    <option key={fieldName} value={fieldName}>
                      {fieldName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Direction
                <select
                  value={viewEditorSortDirection}
                  onChange={(event) =>
                    setViewEditorSortDirection(event.target.value as "asc" | "desc")
                  }
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
                  disabled={!viewEditorSortField}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button intent="ghost" size="sm" onPress={closeViewEditor}>
                Cancel
              </Button>
              <Button intent="secondary" size="sm" onPress={() => void handleSaveView()}>
                Save view
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </div>
  );
}
