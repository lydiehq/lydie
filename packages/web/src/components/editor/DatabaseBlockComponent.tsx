import type { FieldDefinition } from "@lydie/core/database";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { NodeViewWrapper, type NodeViewRendererProps } from "@tiptap/react";
import { useMemo, useState } from "react";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

export function DatabaseBlockComponent(props: NodeViewRendererProps) {
  const { node, editor, getPos } = props;
  const { sourcePageId, filters, sortField, sortDirection, viewMode } = node.attrs;
  useZero();
  const [isEditing, setIsEditing] = useState(false);

  // Get organization from context
  const { organization } = useOrganization();
  const organizationId = organization?.id || "";

  // Query the source page for its schema and children
  const [sourcePage] = useQuery(
    queries.documents.byId({
      organizationId,
      documentId: sourcePageId,
    }),
  );

  // Query children of the source page
  const [children] = useQuery(
    queries.database.childrenByParent({
      organizationId,
      parentId: sourcePageId,
    }),
  );

  const schema = (sourcePage?.child_schema || []) as FieldDefinition[];

  // Apply filters and sorting
  const filteredChildren = useMemo(() => {
    if (!children) return [];

    let result = [...children];

    // Apply filters
    if (filters && Object.keys(filters).length > 0) {
      result = result.filter((child) => {
        return Object.entries(filters).every(([key, value]) => {
          const properties = (child.properties || {}) as Record<string, unknown>;
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
  }, [children, filters, sortField, sortDirection]);

  const handleUpdate = (attrs: Partial<typeof node.attrs>) => {
    const pos = getPos();
    if (typeof pos === "number") {
      editor.chain().focus().updateAttributes("databaseBlock", attrs).run();
    }
  };

  if (!sourcePageId) {
    return (
      <NodeViewWrapper>
        <div className="my-4 p-4 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">Select a page to embed its database</p>
          <input
            type="text"
            placeholder="Enter page ID..."
            className="w-full px-3 py-2 text-sm border rounded"
            onChange={(e) => handleUpdate({ sourcePageId: e.target.value })}
          />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div className="my-4 border border-gray-200 rounded-lg overflow-hidden bg-white">
        {/* Header with filter/sort controls */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{sourcePage?.title || "Untitled"}</span>
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

        {/* Database view */}
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
                {filteredChildren.map((child) => (
                  <tr key={child.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{child.title || "Untitled"}</td>
                    {schema.map((field) => {
                      const properties = (child.properties || {}) as Record<string, unknown>;
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
              {filteredChildren.map((child) => (
                <div key={child.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="font-medium">{child.title || "Untitled"}</div>
                  {schema.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {schema.slice(0, 3).map((field) => {
                        const properties = (child.properties || {}) as Record<string, unknown>;
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

        {/* Empty state */}
        {filteredChildren.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500">
            <p className="text-sm">No items match the current filters</p>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
