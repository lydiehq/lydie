import { DismissFilled, FolderFilled, SearchFilled } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { NodeViewWrapper, type NodeViewRendererProps } from "@tiptap/react";
import { useCallback, useMemo, useState } from "react";

const collectionByIdQuery = queries.collections.byId as any;
const documentsByCollectionQuery = queries.collections.documentsByCollection as any;
const collectionsByOrganizationQuery = queries.collections.byOrganization as any;

type Props = NodeViewRendererProps & {
  organizationId: string;
};

type DocumentItem = {
  id: string;
  title: string;
  properties: Record<string, unknown>;
};

const columnHelper = createColumnHelper<DocumentItem>();

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function CollectionBlockComponent(props: Props) {
  const { node, editor, getPos, organizationId } = props;
  const { collectionId, filters, sortField, sortDirection, viewMode } = node.attrs;
  const [isEditing, setIsEditing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Query the collection for its schema
  const [collection] = useQuery(
    collectionByIdQuery({
      organizationId,
      collectionId,
    }),
    { enabled: collectionId && organizationId },
  );

  // Query documents in the collection
  const [documents] = useQuery(
    collectionId && organizationId
      ? documentsByCollectionQuery({
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
  const documentsData = useMemo(() => (documents ?? []) as any[], [documents]);
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

  const extractFieldValues = useCallback(
    (doc: { fieldValues?: unknown }) => {
      const fieldValues = (doc.fieldValues || []) as Array<{
        values?: unknown;
        collectionSchema?: { document_id?: string };
      }>;

      const row =
        fieldValues.find((value) => value.collectionSchema?.document_id === collectionId) ??
        fieldValues[0];

      if (typeof row?.values === "object" && row.values !== null) {
        return row.values as Record<string, unknown>;
      }

      return {};
    },
    [collectionId],
  );

  const documentPropertiesById = useMemo(() => {
    const propertiesById = new Map<string, Record<string, unknown>>();

    for (const doc of documentsData) {
      propertiesById.set(doc.id, extractFieldValues(doc));
    }

    return propertiesById;
  }, [documentsData, extractFieldValues]);

  // Apply filters and sorting
  const filteredDocuments = useMemo(() => {
    let result = [...documentsData];

    // Apply filters
    if (filters && Object.keys(filters).length > 0) {
      result = result.filter((doc) => {
        return Object.entries(filters).every(([key, value]) => {
          const properties = documentPropertiesById.get(doc.id) || {};
          return properties[key] === value;
        });
      });
    }

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        const aProps = documentPropertiesById.get(a.id) || {};
        const bProps = documentPropertiesById.get(b.id) || {};
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
  }, [documentPropertiesById, documentsData, filters, sortField, sortDirection]);

  // Transform filtered documents to table format
  const tableDocuments = useMemo<DocumentItem[]>(() => {
    return filteredDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title || "Untitled",
      properties: extractFieldValues(doc),
    }));
  }, [filteredDocuments, extractFieldValues]);

  // Define table columns
  const columns = useMemo(() => {
    return [
      columnHelper.accessor("title", {
        id: "title",
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</span>
        ),
        cell: ({ getValue }) => <span className="font-medium text-gray-900">{getValue()}</span>,
      }),
      ...schema.map((fieldDef) =>
        columnHelper.display({
          id: fieldDef.name,
          header: () => (
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {fieldDef.name}
            </span>
          ),
          cell: ({ row }) => {
            const value = row.original.properties[fieldDef.name];
            return <span className="text-gray-600">{formatCellValue(value)}</span>;
          },
        }),
      ),
    ];
  }, [schema]);

  const table = useReactTable({
    data: tableDocuments,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

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
            <span className="font-medium text-sm">{collectionName}</span>
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
          </div>
        )}

        {/* Collection view */}
        <div className="overflow-x-auto">
          {viewMode === "table" ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50/80">
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-4 py-2.5 text-left align-middle">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 align-top last:border-b-0 hover:bg-gray-50/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
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
                        const properties = documentPropertiesById.get(doc.id) || {};
                        const value = properties[field.name];
                        if (value === null || value === undefined) return null;
                        return (
                          <span
                            key={field.name}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                          >
                            {field.name}: {formatCellValue(value)}
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
