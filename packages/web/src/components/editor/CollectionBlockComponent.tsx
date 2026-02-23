import { Add16Filled, DismissFilled, FolderFilled, SearchFilled } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { NodeViewWrapper, type NodeViewRendererProps } from "@tiptap/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CollectionTable } from "@/components/modules/CollectionTable";
import { useZero } from "@/services/zero";

const collectionByIdQuery = queries.collections.byId as any;
const collectionsByOrganizationQuery = queries.collections.byOrganization as any;

type Props = NodeViewRendererProps & {
  organizationId: string;
  organizationSlug: string;
};

export function CollectionBlockComponent(props: Props) {
  const { node, editor, getPos, organizationId, organizationSlug } = props;
  const z = useZero();
  const { collectionId, filters } = node.attrs;
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Query the collection for its schema
  const [collection] = useQuery(
    collectionId && organizationId
      ? collectionByIdQuery({
          organizationId,
          collectionId,
        })
      : null,
  );

  // Query all collections for the picker
  const [collections] = useQuery(
    organizationId
      ? collectionsByOrganizationQuery({
          organizationId,
        })
      : null,
  );

  const collectionData = collection as any;
  const collectionsData = useMemo(
    () =>
      (collections ?? []) as unknown as Array<{
        id: string;
        name?: string;
      }>,
    [collections],
  );

  const collectionName = (collectionData?.name as string | undefined) || "Untitled";

  const schema = (collectionData?.properties || []) as PropertyDefinition[];
  const availableCollections: Array<{ id: string; name: string }> = collectionsData.map(
    (entry) => ({
      id: entry.id,
      name: entry.name || "Untitled",
    }),
  );

  const handleUpdate = (attrs: Partial<typeof node.attrs>) => {
    const pos = getPos();
    if (typeof pos === "number") {
      editor.chain().focus().updateAttributes("collectionBlock", attrs).run();
    }
  };

  const handleSelectCollection = (collection: { id: string; name: string }) => {
    handleUpdate({ collectionId: collection.id });
    setSearchQuery("");
  };

  const handleCreateCollection = async () => {
    if (isCreatingCollection) {
      return;
    }

    const id = createId();
    const name = newCollectionName.trim() || "Untitled Collection";

    setIsCreatingCollection(true);
    setNewCollectionName("");

    handleSelectCollection({ id, name });

    try {
      await z.mutate(
        mutators.collection.create({
          collectionId: id,
          organizationId,
          name,
          properties: [],
        }),
      );
    } catch (error) {
      handleUpdate({ collectionId: null });
      console.error(error);
      toast.error("Failed to create collection");
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

    z.mutate(
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
    return availableCollections.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 8);
  }, [availableCollections, searchQuery]);

  // Empty state - no collection selected
  if (!collectionId) {
    return (
      <NodeViewWrapper
        className="doc-block-wide w-full !max-w-none !mx-0 !px-0"
        data-doc-block-wide
      >
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
                  Or use an existing collection
                </div>
                <p className="text-xs text-gray-500">
                  Pick one to embed it as this collection view.
                </p>
              </div>

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
                  filteredCollections.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCollection(c)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-3 transition-colors"
                    >
                      <FolderFilled className="size-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {c.name || "Untitled"}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className="doc-block-wide w-full"
      data-doc-block-wide
      style={{
        marginLeft: "var(--editor-content-line-start, var(--editor-block-padding-x, 1rem))",
        width:
          "calc(100% - var(--editor-content-line-start, var(--editor-block-padding-x, 1rem)))",
      }}
    >
      <div data-doc-widget className="flex flex-col gap-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-lg">{collectionName}</span>
            {filters && Object.keys(filters).length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                Filtered
              </span>
            )}
          </div>
        </div>

        <div
          className="overflow-x-auto"
          style={{
            marginLeft:
              "calc(-1 * var(--editor-content-line-start, var(--editor-block-padding-x, 1rem)))",
            paddingLeft: "var(--editor-content-line-start, var(--editor-block-padding-x, 1rem))",
          }}
        >
          <CollectionTable
            collectionId={collectionId}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            schema={schema}
            showCreateRowButton={false}
          />
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
