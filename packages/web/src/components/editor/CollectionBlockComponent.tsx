import { DismissFilled, FolderFilled, SearchFilled } from "@fluentui/react-icons";
import type { CollectionField } from "@lydie/core/collection";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { NodeViewWrapper, type NodeViewRendererProps } from "@tiptap/react";
import { useMemo, useState } from "react";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

export function CollectionBlockComponent(props: NodeViewRendererProps) {
  const { node, editor, getPos } = props;
  const { collectionId, filters, sortField, sortDirection, viewMode } = node.attrs;
  useZero();
  const [isEditing, setIsEditing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Get organization from context
  const { organization } = useOrganization();
  const organizationId = organization?.id || "";

  // Query the collection for its schema
  const [collection] = useQuery(
    collectionId
      ? queries.collections.byId({
          organizationId,
          collectionId,
        })
      : null,
  );

  // Query documents in the collection
  const [documents] = useQuery(
    collectionId
      ? queries.collections.documentsByCollection({
          organizationId,
          collectionId,
        })
      : null,
  );

  // Query all collections for the picker
  const [collections] = useQuery(queries.collections.byOrganization({ organizationId }));

  const schema = (collection?.collection_schema || []) as CollectionField[];

  // Apply filters and sorting
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];

    let result = [...documents];

    // Apply filters
    if (filters && Object.keys(filters).length > 0) {
      result = result.filter((doc) => {
        return Object.entries(filters).every(([key, value]) => {
          const properties = (doc.properties || {}) as Record<string, unknown>;
          return properties[key] === value;
        });
      });
    }

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        const aProps = (a.properties || {}) as Record<string, unknown>;
        const bProps = (b.properties || {}) as Record<string, unknown>;
        const aVal = aProps[sortField] as string | number | null;
        const bVal = bProps[sortField] as string | number | null;

        if (aVal === null || aVal === undefined) return sortDirection === "asc" ? 1 : -1;
        if (bVal === null || bVal === undefined) return sortDirection === "asc" ? -1 : 1;

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [documents, filters, sortField, sortDirection]);

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
    if (!searchQuery.trim()) return collections?.slice(0, 5) || [];
    const query = searchQuery.toLowerCase();
    return (collections || []).filter((c) => c.name.toLowerCase().includes(query)).slice(0, 8);
  }, [collections, searchQuery]);

  // Empty state - no collection selected
  if (!collectionId) {
    return (
      <NodeViewWrapper>
        <div className="my-4 p-4 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 min-h-[120px]">
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
              {collections && collections.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 mb-2">Available collections:</div>
                  {collections.slice(0, 3).map((c) => (
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

  // Loading state when collectionId is set but data hasn't loaded yet
  if (!collection) {
    return (
      <NodeViewWrapper>
        <div className="my-4 border border-gray-200 rounded-lg overflow-hidden bg-white min-h-[100px] flex items-center justify-center">
          <div className="text-sm text-gray-500">Loading collection...</div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div className="my-4 border border-gray-200 rounded-lg overflow-hidden bg-white min-h-[100px]">
        {/* Header with filter/sort controls */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{collection?.name || "Untitled"}</span>
            {Object.keys(filters).length > 0 && (
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
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 space-y-3">
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
                  <option key={field.field} value={field.field}>
                    {field.field}
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
          </div>
        )}

        {/* Collection view */}
        <div className="overflow-x-auto">
          {viewMode === "table" ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Title</th>
                  {schema.map((field) => (
                    <th key={field.field} className="px-4 py-2 text-left font-medium text-gray-600">
                      {field.field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{doc.title || "Untitled"}</td>
                    {schema.map((field) => {
                      const properties = (doc.properties || {}) as Record<string, unknown>;
                      const value = properties[field.field];
                      return (
                        <td key={field.field} className="px-4 py-2 text-gray-600">
                          {value !== null && value !== undefined ? String(value) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredDocuments.map((doc) => (
                <div key={doc.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="font-medium">{doc.title || "Untitled"}</div>
                  {schema.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {schema.slice(0, 3).map((field) => {
                        const properties = (doc.properties || {}) as Record<string, unknown>;
                        const value = properties[field.field];
                        if (value === null || value === undefined) return null;
                        return (
                          <span
                            key={field.field}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                          >
                            {field.field}: {String(value)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Empty state - only show when no documents at all */}
        {filteredDocuments.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500 min-h-[60px] flex items-center justify-center">
            <p className="text-sm">
              {documents && documents.length === 0
                ? "No documents in this collection"
                : "No documents match the current filters"}
            </p>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
