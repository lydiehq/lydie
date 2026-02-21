import type { PropertyDefinition } from "@lydie/core/collection";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";

import { useZero } from "@/services/zero";

const PROPERTY_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "boolean", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "multi-select", label: "Multi Select" },
  { value: "relation", label: "Relation" },
] as const;

type Props = {
  collectionId: string;
  organizationId: string;
  schema: PropertyDefinition[];
  isAdmin: boolean;
};

export function PropertyManager({ collectionId, organizationId, schema, isAdmin }: Props) {
  const z = useZero();
  const [isAdding, setIsAdding] = useState(false);
  const [newProperty, setNewProperty] = useState<{
    name: string;
    type: PropertyDefinition["type"];
    required: boolean;
    unique: boolean;
    options: string;
    relationTargetCollectionId: string;
  }>({
    name: "",
    type: "text",
    required: false,
    unique: false,
    options: "",
    relationTargetCollectionId: "self",
  });
  const [collections] = useQuery(
    queries.collections.byOrganization({
      organizationId,
    }),
  );

  const saveSchema = async (nextSchema: PropertyDefinition[]) => {
    await z.mutate(
      mutators.collection.update({
        collectionId,
        organizationId,
        properties: nextSchema,
      }),
    );
  };

  const handleAddProperty = async () => {
    if (!newProperty.name.trim()) return;

    const propDef: PropertyDefinition = {
      name: newProperty.name.trim(),
      type: newProperty.type,
      required: newProperty.required,
      unique: newProperty.unique,
      ...(newProperty.type === "select" || newProperty.type === "multi-select"
        ? {
            options: newProperty.options
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
      ...(newProperty.type === "relation"
        ? {
            relation: {
              targetCollectionId: newProperty.relationTargetCollectionId,
            },
          }
        : {}),
    };

    await saveSchema([...schema, propDef]);

    setIsAdding(false);
    setNewProperty({
      name: "",
      type: "text",
      required: false,
      unique: false,
      options: "",
      relationTargetCollectionId: "self",
    });
  };

  const handleRemoveProperty = async (fieldName: string) => {
    await saveSchema(schema.filter((field) => field.name !== fieldName));
  };

  if (!isAdmin) {
    if (schema.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2">
        {schema.map((field) => (
          <div
            key={field.name}
            className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm"
          >
            <span className="font-medium">{field.name}</span>
            <span className="text-gray-400 text-xs">({field.type})</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schema.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {schema.map((field) => (
            <div
              key={field.name}
              className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm"
            >
              <span className="font-medium">{field.name}</span>
              <span className="text-blue-500 text-xs">({field.type})</span>
              {isAdmin && (
                <button
                  onClick={() => handleRemoveProperty(field.name)}
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

      {isAdding ? (
        <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-3">
          <div>
            <label
              htmlFor="collection-property-name"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Property name
            </label>
            <input
              id="collection-property-name"
              type="text"
              value={newProperty.name}
              onChange={(e) => setNewProperty((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g., status, priority, dueDate"
              className="w-full px-2 py-1.5 text-sm border rounded"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="collection-property-type"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Type
            </label>
            <select
              id="collection-property-type"
              value={newProperty.type}
              onChange={(e) =>
                setNewProperty((p) => ({
                  ...p,
                  type: e.target.value as PropertyDefinition["type"],
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

          {(newProperty.type === "select" || newProperty.type === "multi-select") && (
            <div>
              <label
                htmlFor="collection-property-options"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Options (comma-separated)
              </label>
              <input
                id="collection-property-options"
                type="text"
                value={newProperty.options}
                onChange={(e) => setNewProperty((p) => ({ ...p, options: e.target.value }))}
                placeholder="todo, in-progress, done"
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
          )}

          {newProperty.type === "relation" && (
            <div>
              <label
                htmlFor="collection-property-relation-target"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Target collection
              </label>
              <select
                id="collection-property-relation-target"
                value={newProperty.relationTargetCollectionId}
                onChange={(e) =>
                  setNewProperty((p) => ({
                    ...p,
                    relationTargetCollectionId: e.target.value,
                  }))
                }
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                <option value="self">This collection</option>
                {(collections ?? [])
                  .filter((collection) => collection.id !== collectionId)
                  .map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-4">
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

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="unique"
                checked={newProperty.unique}
                onChange={(e) => setNewProperty((p) => ({ ...p, unique: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="unique" className="text-sm text-gray-600">
                Unique
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddProperty}
              disabled={!newProperty.name.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Property
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
          <span>Add property</span>
        </button>
      )}
    </div>
  );
}
