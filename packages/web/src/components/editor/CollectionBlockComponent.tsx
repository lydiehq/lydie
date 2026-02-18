import { DismissFilled, FolderFilled, SearchFilled } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { NodeViewWrapper, type NodeViewRendererProps } from "@tiptap/react";
import { useMemo, useState } from "react";

import { RecordsTable } from "@/components/modules/RecordsTable";

const collectionByIdQuery = queries.collections.byId as any;
const collectionsByOrganizationQuery = queries.collections.byOrganization as any;

type Props = NodeViewRendererProps & {
  organizationId: string;
  organizationSlug: string;
};

export function CollectionBlockComponent(props: Props) {
  const { node, editor, getPos, organizationId, organizationSlug } = props;
  const { collectionId, filters, sortField, sortDirection } = node.attrs;
  const [isEditing, setIsEditing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
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
        document_id: string;
        document?: { title?: string };
      }>,
    [collections],
  );

  const collectionName =
    ((collectionData?.document as { title?: string } | undefined)?.title as string | undefined) ||
    "Untitled";

  const schema = (collectionData?.properties || []) as PropertyDefinition[];
  const availableCollections: Array<{ id: string; name: string }> = collectionsData.map(
    (entry) => ({
      id: entry.document_id,
      name: entry.document?.title || "Untitled",
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
    setShowSearch(false);
    setSearchQuery("");
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

  // Filter collections based on search query
  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return availableCollections.slice(0, 5);
    const query = searchQuery.toLowerCase();
    return availableCollections.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 8);
  }, [availableCollections, searchQuery]);

  // Empty state - no collection selected
  if (!collectionId) {
    return (
      <NodeViewWrapper>
        <div className="">
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

          <p className="text-sm text-gray-500 mb-3">Select a collection to embed its documents</p>

          {showSearch ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg">
                <SearchFilled className="size-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search collections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 text-sm outline-none bg-transparent"
                  autoFocus
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
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Show available collections */}
              {availableCollections.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 mb-2">Available collections:</div>
                  {availableCollections.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCollection(c)}
                      className="w-full text-left px-3 py-2 bg-white border border-gray-200 rounded hover:border-gray-300 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    >
                      <FolderFilled className="size-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {c.name || "Untitled"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowSearch(true)}
                className="w-full px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded border border-dashed border-blue-200 transition-colors"
              >
                + Search for a collection...
              </button>
            </div>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div className="">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-lg">{collectionName}</span>
            {filters && Object.keys(filters).length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                Filtered
              </span>
            )}
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {isEditing ? "Done" : "Configure"}
          </button>
        </div>

        {/* Configuration panel */}
        {isEditing && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Sort by:</span>
            <select
              value={sortField || ""}
              onChange={(e) => handleUpdate({ sortField: e.target.value || null })}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="">—</option>
              <option value="title">Title</option>
              {schema.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.name}
                </option>
              ))}
            </select>
            <select
              value={sortDirection}
              onChange={(e) => handleUpdate({ sortDirection: e.target.value as "asc" | "desc" })}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        )}
        <RecordsTable
          collectionId={collectionId}
          organizationId={organizationId}
          organizationSlug={organizationSlug}
          schema={schema}
        />
      </div>
    </NodeViewWrapper>
  );
}
