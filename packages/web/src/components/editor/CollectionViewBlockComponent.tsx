import {
  Add16Filled,
  DismissFilled,
  FolderFilled,
  SearchFilled,
  Open12Regular,
} from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { CollectionItemIcon } from "@lydie/ui/components/icons/CollectionItemIcon";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { NodeViewWrapper, type NodeViewRendererProps } from "@tiptap/react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CollectionKanban } from "@/components/modules/CollectionKanban";
import { CollectionTable } from "@/components/modules/CollectionTable";
import { useZero } from "@/services/zero";

import { Link } from "../generic/Link";

const collectionsByOrganizationQuery = queries.collections.byOrganization as any;
const viewsByCollectionQuery = queries.collections.viewsByCollection as any;
const collectionViewByIdQuery = queries.collections.viewById as any;

type Props = NodeViewRendererProps & {
  documentId: string;
  organizationId: string;
  organizationSlug: string;
};

export function CollectionViewBlockComponent(props: Props) {
  const { node, editor, getPos, organizationId, organizationSlug, documentId } = props;
  const z = useZero();
  const { viewId } = node.attrs;
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerCollectionId, setPickerCollectionId] = useState<string | null>(null);

  const [view] = useQuery(
    viewId && organizationId
      ? collectionViewByIdQuery({
          organizationId,
          viewId,
        })
      : null,
  );

  const [collections] = useQuery(
    organizationId
      ? collectionsByOrganizationQuery({
          organizationId,
        })
      : null,
  );

  const viewData = view as any;
  const collectionData = viewData?.collection as any;
  const collectionsData = useMemo(
    () =>
      (collections ?? []) as unknown as Array<{
        id: string;
        name?: string;
      }>,
    [collections],
  );

  const collectionName = (collectionData?.name as string | undefined) || "Untitled";
  const collectionId = (collectionData?.id as string | undefined) ?? null;
  const viewName = (viewData?.name as string | undefined) || "Untitled view";
  const viewConfig = (viewData?.config as { filters?: Record<string, unknown> } | undefined) ?? {};
  const filters = viewConfig.filters ?? {};
  const viewType = (viewData?.type as "table" | "list" | "kanban" | undefined) ?? "table";
  const viewsCollectionId = collectionId ?? pickerCollectionId;

  const [collectionViews] = useQuery(
    viewsCollectionId
      ? viewsByCollectionQuery({
          organizationId,
          collectionId: viewsCollectionId,
        })
      : null,
  );

  const schema = (collectionData?.properties || []) as PropertyDefinition[];
  const availableCollections: Array<{
    id: string;
    name: string;
  }> = collectionsData.map((entry) => ({
    id: entry.id,
    name: entry.name || "Untitled",
  }));

  const handleUpdate = useCallback(
    (attrs: Partial<typeof node.attrs>) => {
      const pos = getPos();
      if (typeof pos === "number") {
        const hasChanges = Object.entries(attrs).some(
          ([key, value]) => node.attrs[key as keyof typeof node.attrs] !== value,
        );
        if (!hasChanges) {
          return;
        }

        const nextAttrs = {
          ...node.attrs,
          ...attrs,
        };

        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, nextAttrs));
      }
    },
    [editor, getPos, node],
  );

  const blockId = (node.attrs.blockId as string | null | undefined) ?? null;

  useEffect(() => {
    if (!blockId) {
      return;
    }

    if (viewId) {
      void z.mutate(
        mutators.collection.upsertViewUsage({
          organizationId,
          documentId,
          viewId,
          blockId,
        }),
      );
    }

    return () => {
      void z.mutate(
        mutators.collection.deleteViewUsageByBlock({
          organizationId,
          documentId,
          blockId,
        }),
      );
    };
  }, [blockId, documentId, organizationId, viewId, z]);

  const handleSelectView = (view: { id: string }) => {
    handleUpdate({ viewId: view.id });
    setPickerCollectionId(null);
    setSearchQuery("");
  };

  const handleCreateCollection = async () => {
    if (isCreatingCollection) {
      return;
    }

    const id = createId();
    const defaultViewId = createId();
    const name = newCollectionName.trim() || "Untitled Collection";

    setIsCreatingCollection(true);
    setNewCollectionName("");

    try {
      await z.mutate(
        mutators.collection.create({
          collectionId: id,
          defaultViewId,
          organizationId,
          name,
          properties: [],
        }),
      );

      handleUpdate({ viewId: defaultViewId });
    } catch (error) {
      handleUpdate({ viewId: null });
      console.error(error);
      toast.error("Failed to create collection view");
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handleRemoveBlock = () => {
    const pos = getPos();
    if (typeof pos === "number") {
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .run();
    }
  };

  const handleCreateRow = () => {
    if (!collectionId) {
      return;
    }

    void z.mutate(
      mutators.document.create({
        id: createId(),
        organizationId,
        collectionId,
        title: "",
      }),
    );
  };

  // Filter collections based on search query
  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return availableCollections.slice(0, 8);
    const query = searchQuery.toLowerCase();
    return availableCollections
      .filter((collection) => {
        return collection.name.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [availableCollections, searchQuery]);

  const collectionViewsData = useMemo(
    () =>
      (collectionViews ?? []) as unknown as Array<{
        id: string;
        name: string;
        type: "table" | "list" | "kanban";
      }>,
    [collectionViews],
  );

  const selectedPickerCollection = useMemo(
    () => availableCollections.find((collection) => collection.id === pickerCollectionId) ?? null,
    [availableCollections, pickerCollectionId],
  );

  // Empty state - no collection selected
  if (!viewId || !collectionId) {
    return (
      <NodeViewWrapper>
        <div
          data-doc-widget
          style={{
            paddingLeft: "var(--editor-content-line-start, var(--editor-block-padding-x, 1rem))",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderFilled className="size-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Collection View</span>
            </div>
            <button
              onClick={handleRemoveBlock}
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200"
              title="Remove block"
            >
              <DismissFilled className="size-4" />
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-900">Create your new collection</div>
                <p className="text-xs text-gray-500">Give it a name and start adding documents.</p>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Collection name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreateCollection();
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
                <button
                  onClick={() => void handleCreateCollection()}
                  disabled={isCreatingCollection}
                  className="w-full px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded border border-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Add16Filled className="size-3.5" />
                  {isCreatingCollection ? "Creating..." : "Create collection"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-900">
                  {pickerCollectionId ? "Choose a view" : "Or use an existing collection"}
                </div>
                <p className="text-xs text-gray-500">
                  {pickerCollectionId
                    ? `Select a view from ${selectedPickerCollection?.name ?? "this collection"}.`
                    : "Pick a collection first, then choose which view to embed."}
                </p>
              </div>

              {!pickerCollectionId ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                    <SearchFilled className="size-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search collections..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 text-sm outline-none bg-transparent"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredCollections.length === 0 ? (
                      <div className="text-sm text-gray-500 py-4 text-center">
                        {searchQuery.trim() ? "No collections found" : "No collections available"}
                      </div>
                    ) : (
                      filteredCollections.map((collectionOption) => (
                        <button
                          key={collectionOption.id}
                          onClick={() => setPickerCollectionId(collectionOption.id)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-3 transition-colors"
                        >
                          <FolderFilled className="size-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {collectionOption.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">Choose collection</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setPickerCollectionId(null)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Back to collections
                  </button>

                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {collectionViewsData.length === 0 ? (
                      <div className="text-sm text-gray-500 py-4 text-center">No views available</div>
                    ) : (
                      collectionViewsData.map((viewOption) => (
                        <button
                          key={viewOption.id}
                          onClick={() => handleSelectView({ id: viewOption.id })}
                          className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-3 transition-colors"
                        >
                          <FolderFilled className="size-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {viewOption.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate capitalize">
                              {viewOption.type}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className=" w-full"
      data-doc-block-wide
      style={{
        paddingLeft: "var(--editor-content-line-start, var(--editor-block-padding-x, 1rem))",
      }}
    >
      <div data-doc-widget className="flex flex-col gap-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div
              className="inline-flex"
              initial="rest"
              whileHover="hover"
              whileFocus="hover"
            >
              <Link
                to="/w/$organizationSlug/collections/$collectionId"
                params={{ collectionId }}
                from="/w/$organizationSlug"
                className="inline-flex items-center gap-2 rounded px-1 py-0.5 text-gray-900 transition-colors hover:bg-gray-100"
              >
                <span className="relative flex size-4 items-center justify-center text-gray-500">
                  <motion.span
                    className="absolute inset-0 flex items-center justify-center"
                    variants={{
                      rest: { opacity: 1, scale: 1 },
                      hover: { opacity: 0, scale: 0.88 },
                    }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                  >
                    <CollectionItemIcon />
                  </motion.span>
                  <motion.span
                    className="absolute inset-0 flex items-center justify-center"
                    variants={{
                      rest: { opacity: 0, scale: 0.88 },
                      hover: { opacity: 1, scale: 1 },
                    }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                  >
                    <Open12Regular className="size-4" />
                  </motion.span>
                </span>
                <span className="font-medium text-lg">{collectionName}</span>
                <span className="text-sm text-gray-500">/ {viewName}</span>
              </Link>
            </motion.div>
            {filters && Object.keys(filters).length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                Filtered
              </span>
            )}
          </div>
        </div>

        {collectionViewsData.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {collectionViewsData.map((viewOption) => (
              <button
                key={viewOption.id}
                type="button"
                onClick={() => handleUpdate({ viewId: viewOption.id })}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  viewOption.id === viewId
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {viewOption.name}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className="overflow-x-auto"
          style={{
            marginLeft:
              "calc(-1 * var(--editor-content-line-start, var(--editor-block-padding-x, 1rem)))",
            paddingLeft: "var(--editor-content-line-start, var(--editor-block-padding-x, 1rem))",
          }}
        >
          {viewType === "kanban" ? (
            <CollectionKanban
              collectionId={collectionId}
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              schema={schema}
            />
          ) : (
            <CollectionTable
              collectionId={collectionId}
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              schema={schema}
              showCreateRowButton={false}
            />
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={handleCreateRow}
            className="w-full px-3 py-1 text-left text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            New
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
