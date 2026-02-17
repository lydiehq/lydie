import type { CollectionField } from "@lydie/core/collection";
import { mutators } from "@lydie/zero/mutators";
import { useState } from "react";

import { useZero } from "@/services/zero";

const PROPERTY_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "boolean", label: "Checkbox" },
  { value: "datetime", label: "Date & Time" },
  { value: "file", label: "File" },
] as const;

type Props = {
  documentId: string;
  organizationId: string;
  schema: CollectionField[];
  isCollection: boolean;
};

export function PropertyManager({ documentId, organizationId, schema, isCollection }: Props) {
  const z = useZero();
  const [isAdding, setIsAdding] = useState(false);
  const [newProperty, setNewProperty] = useState<{
    field: string;
    type: CollectionField["type"];
    required: boolean;
    options: string;
  }>({
    field: "",
    type: "text",
    required: false,
    options: "",
  });

  const handleAddProperty = async () => {
    if (!newProperty.field.trim()) return;

    const fieldDef: CollectionField = {
      field: newProperty.field.trim(),
      type: newProperty.type,
      required: newProperty.required,
      ...(newProperty.type === "select" && newProperty.options
        ? {
            options: newProperty.options
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    };

    const updatedSchema = [...schema, fieldDef];

    if (isCollection) {
      // Page is already a collection, just update the schema
      await z.mutate(
        mutators.collection.updateSchema({
          collectionId: documentId,
          organizationId,
          schema: updatedSchema,
        }),
      );
    } else {
      // Page is not a collection yet - adding first field makes it a collection
      await z.mutate(
        mutators.document.makeCollection({
          documentId,
          organizationId,
          collectionSchema: updatedSchema,
        }),
      );
    }

    setIsAdding(false);
    setNewProperty({
      field: "",
      type: "text",
      required: false,
      options: "",
    });
  };

  const handleRemoveProperty = async (fieldName: string) => {
    const updatedSchema = schema.filter((f) => f.field !== fieldName);

    await z.mutate(
      mutators.collection.updateSchema({
        collectionId: documentId,
        organizationId,
        schema: updatedSchema,
      }),
    );
  };

  return (
    <div className="space-y-3">
      {/* Show message when page is not yet a collection */}
      {!isCollection && schema.length === 0 && (
        <p className="text-sm text-gray-500">
          Add a property to make this page a collection. Its children will become entries.
        </p>
      )}

      {/* Existing properties list */}
      {schema.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {schema.map((field) => (
            <div
              key={field.field}
              className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm"
            >
              <span className="font-medium">{field.field}</span>
              <span className="text-blue-500 text-xs">({field.type})</span>
              {isCollection && (
                <button
                  onClick={() => handleRemoveProperty(field.field)}
                  className="ml-1 text-blue-400 hover:text-blue-600"
                  title="Remove property"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add property form */}
      {isAdding ? (
        <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Property name</label>
            <input
              type="text"
              value={newProperty.field}
              onChange={(e) => setNewProperty((p) => ({ ...p, field: e.target.value }))}
              placeholder="e.g., status, priority, dueDate"
              className="w-full px-2 py-1.5 text-sm border rounded"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              value={newProperty.type}
              onChange={(e) =>
                setNewProperty((p) => ({
                  ...p,
                  type: e.target.value as CollectionField["type"],
                }))
              }
              className="w-full px-2 py-1.5 text-sm border rounded"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {newProperty.type === "select" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Options (comma-separated)
              </label>
              <input
                type="text"
                value={newProperty.options}
                onChange={(e) => setNewProperty((p) => ({ ...p, options: e.target.value }))}
                placeholder="todo, in-progress, done"
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="required"
              checked={newProperty.required}
              onChange={(e) => setNewProperty((p) => ({ ...p, required: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="required" className="text-sm text-gray-600">
              Required
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddProperty}
              disabled={!newProperty.field.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCollection ? "Add Property" : "Make Collection"}
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-gray-600 text-sm hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
        >
          <span className="text-lg">+</span>
          <span>{isCollection ? "Add property" : "Add property to make collection"}</span>
        </button>
      )}
    </div>
  );
}
