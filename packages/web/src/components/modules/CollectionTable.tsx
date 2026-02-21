import { resolveRelationTargetCollectionId, type PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { Cell, Column, Row, Table, TableHeader } from "@lydie/ui/components/generic/Table";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useState } from "react";
import {
  DialogTrigger,
  TableBody,
  type Selection,
  type SortDescriptor,
} from "react-aria-components";
import { toast } from "sonner";

import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";

type DocumentItem = {
  id: string;
  title: string;
  slug: string | null;
  parentId: string | null;
  collectionId: string | null;
  properties: Record<string, string | number | boolean | null>;
};

const PROPERTY_TYPES: Array<{ label: string; value: PropertyDefinition["type"] }> = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Select", value: "select" },
  { label: "Multi Select", value: "multi-select" },
  { label: "Date", value: "date" },
  { label: "Checkbox", value: "boolean" },
  { label: "Relation", value: "relation" },
];

type Props = {
  collectionId: string;
  organizationId: string;
  organizationSlug: string;
  schema: PropertyDefinition[];
};

function toFieldValue(
  fieldDef: PropertyDefinition,
  value: string,
): string | number | boolean | null {
  if (fieldDef.type === "boolean") {
    return value === "true";
  }
  if (fieldDef.type === "number") {
    return value === "" ? null : Number(value);
  }
  if (fieldDef.type === "date") {
    return value === "" ? null : value;
  }
  return value === "" ? null : value;
}

function extractFieldValues(
  fieldValues: unknown,
  collectionId: string,
): { collectionId: string | null; values: Record<string, string | number | boolean | null> } {
  const parsedFieldValues = (fieldValues || []) as Array<{
    collection_id: string;
    values: unknown;
  }>;

  if (parsedFieldValues.length === 0) {
    return { collectionId: null, values: {} };
  }

  const activeRow =
    parsedFieldValues.find((row) => row.collection_id === collectionId) ?? parsedFieldValues[0];
  const values = activeRow?.values;

  return {
    collectionId: activeRow?.collection_id ?? null,
    values:
      typeof values === "object" && values !== null
        ? (values as Record<string, string | number | boolean | null>)
        : {},
  };
}

export function CollectionTable({ collectionId, organizationId, organizationSlug, schema }: Props) {
  const z = useZero();
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<PropertyDefinition["type"]>("text");
  const [newPropertyOptions, setNewPropertyOptions] = useState("");
  const [newPropertyRequired, setNewPropertyRequired] = useState(false);
  const [newPropertyUnique, setNewPropertyUnique] = useState(false);
  const [newPropertyRelationTargetCollectionId, setNewPropertyRelationTargetCollectionId] =
    useState<string>("self");
  const [isCreatingRow, setIsCreatingRow] = useState(false);
  const [isAddingRowProperty, setIsAddingRowProperty] = useState(false);
  const [rowSelection, setRowSelection] = useState<Selection>(new Set());
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "title",
    direction: "ascending",
  });
  const [documentsResult] = useQuery(
    collectionId
      ? queries.collections.documentsByCollection({
          organizationId,
          collectionId,
        })
      : null,
  );
  const [allDocuments] = useQuery(
    queries.documents.byUpdated({
      organizationId,
    }),
  );
  const [collections] = useQuery(
    queries.collections.byOrganization({
      organizationId,
    }),
  );

  const documents = useMemo(() => {
    const documentsData = (documentsResult ?? []) as any[];
    return documentsData.map((doc) => {
      const extracted = extractFieldValues(doc.fieldValues, collectionId);
      return {
        id: doc.id,
        title: doc.title,
        slug: doc.slug ?? null,
        parentId: doc.parent_id ?? null,
        collectionId: extracted.collectionId,
        properties: extracted.values,
      } satisfies DocumentItem;
    });
  }, [collectionId, documentsResult]);

  const handleFieldUpdate = useCallback(
    async (
      documentId: string,
      fieldCollectionId: string,
      field: string,
      value: string | number | boolean | null,
    ) => {
      await z.mutate(
        mutators.collection.updateFieldValues({
          documentId,
          collectionId: fieldCollectionId,
          organizationId,
          values: { [field]: value },
        }),
      );
    },
    [organizationId, z],
  );

  const handleCreateRow = async () => {
    setIsCreatingRow(true);
    try {
      await z.mutate(
        mutators.document.create({
          id: createId(),
          organizationId,
          collectionId,
          title: "",
        }),
      );
    } finally {
      setIsCreatingRow(false);
    }
  };

  const handleRenameDocument = useCallback(
    async (documentId: string, title: string) => {
      await z.mutate(
        mutators.document.rename({
          documentId,
          organizationId,
          title,
        }),
      );
    },
    [organizationId, z],
  );

  const handleAddProperty = async () => {
    const trimmedName = newPropertyName.trim();
    if (!trimmedName) {
      return;
    }

    const nameExists = schema.some(
      (property) => property.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (nameExists) {
      return;
    }

    setIsAddingRowProperty(true);

    try {
      const nextSchema: PropertyDefinition[] = [
        ...schema,
        {
          name: trimmedName,
          type: newPropertyType,
          required: newPropertyRequired,
          unique: newPropertyUnique,
          ...(newPropertyType === "select" || newPropertyType === "multi-select"
            ? {
                options: newPropertyOptions
                  .split(",")
                  .map((option) => option.trim())
                  .filter(Boolean),
              }
            : {}),
          ...(newPropertyType === "relation"
            ? {
                relation: {
                  targetCollectionId: newPropertyRelationTargetCollectionId,
                },
              }
            : {}),
        },
      ];

      await z.mutate(
        mutators.collection.update({
          collectionId,
          organizationId,
          properties: nextSchema,
        }),
      );

      setNewPropertyName("");
      setNewPropertyType("text");
      setNewPropertyOptions("");
      setNewPropertyRequired(false);
      setNewPropertyUnique(false);
      setNewPropertyRelationTargetCollectionId("self");
    } finally {
      setIsAddingRowProperty(false);
    }
  };

  const selectedDocumentIds = useMemo(() => {
    const documentIds = new Set(documents.map((document) => document.id));

    if (rowSelection === "all") {
      return documents.map((document) => document.id);
    }

    return Array.from(rowSelection)
      .map(String)
      .filter((id) => documentIds.has(id));
  }, [documents, rowSelection]);

  const handleDeleteSelectedRows = useCallback(() => {
    if (selectedDocumentIds.length === 0) {
      return;
    }

    const deletedDocumentIds = [...selectedDocumentIds];
    const itemLabel = selectedDocumentIds.length === 1 ? "row" : "rows";

    confirmDialog({
      title: `Delete ${selectedDocumentIds.length} selected ${itemLabel}?`,
      message: "This action cannot be undone.",
      onConfirm: () => {
        void (async () => {
          try {
            await z.mutate(
              mutators.document.bulkDelete({
                documentIds: selectedDocumentIds,
                organizationId,
              }),
            );

            setRowSelection(new Set());
            toast(
              selectedDocumentIds.length === 1
                ? "Deleted 1 row"
                : `Deleted ${selectedDocumentIds.length} rows`,
              {
                duration: 5000,
                action: {
                  label: "Undo",
                  onClick: async () => {
                    const restoreResults = await Promise.allSettled(
                      deletedDocumentIds.map((documentId) =>
                        z.mutate(
                          mutators.document.restore({
                            documentId,
                            organizationId,
                          }),
                        ),
                      ),
                    );

                    const didRestoreAnyRow = restoreResults.some(
                      (result) => result.status === "fulfilled",
                    );
                    if (!didRestoreAnyRow) {
                      toast.error("Failed to restore deleted rows");
                      return;
                    }

                    toast.success("Delete undone");
                  },
                },
              },
            );
          } catch (error) {
            console.error(error);
            toast.error("Failed to delete selected rows");
          }
        })();
      },
    });
  }, [organizationId, selectedDocumentIds, z]);

  const relationOptionsByField = useMemo(() => {
    const options = new Map<string, Array<{ id: string; title: string }>>();
    const docs = (allDocuments ?? []) as Array<{
      id: string;
      title: string;
      collection_id: string | null;
    }>;

    for (const property of schema) {
      if (property.type !== "relation") {
        continue;
      }

      const targetCollectionId = resolveRelationTargetCollectionId(
        property.relation,
        collectionId,
      );
      if (!targetCollectionId) {
        continue;
      }

      options.set(
        property.name,
        docs
          .filter((document) => document.collection_id === targetCollectionId)
          .map((document) => ({
            id: document.id,
            title: document.title || "Untitled",
          })),
      );
    }

    return options;
  }, [allDocuments, collectionId, schema]);

  const sortedDocuments = useMemo(() => {
    const sorted = [...documents];

    if (!sortDescriptor.column || sortDescriptor.column === "add-property") {
      return sorted;
    }

    const direction = sortDescriptor.direction === "descending" ? -1 : 1;

    sorted.sort((a, b) => {
      let first: string | number | boolean | null | undefined;
      let second: string | number | boolean | null | undefined;

      if (sortDescriptor.column === "title") {
        first = a.title;
        second = b.title;
      } else {
        first = a.properties[String(sortDescriptor.column)];
        second = b.properties[String(sortDescriptor.column)];
      }

      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;

      if (typeof first === "number" && typeof second === "number") {
        return (first - second) * direction;
      }

      if (typeof first === "boolean" && typeof second === "boolean") {
        return (Number(first) - Number(second)) * direction;
      }

      return (
        String(first).localeCompare(String(second), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * direction
      );
    });

    return sorted;
  }, [documents, sortDescriptor]);

  const selectedRowCount = selectedDocumentIds.length;

  const hasDuplicatePropertyName = schema.some(
    (property) => property.name.toLowerCase() === newPropertyName.trim().toLowerCase(),
  );

  return (
    <div className={`w-full ${selectedRowCount > 0 ? "pb-24" : ""}`}>
      <div className="overflow-x-auto">
        <Table
          aria-label="Collection records"
          className="w-full max-h-none"
          selectionMode="multiple"
          selectedKeys={rowSelection}
          onSelectionChange={setRowSelection}
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
        >
          <TableHeader>
            <Column id="title" isRowHeader allowsSorting>
              <span className="text-xs font-semibold text-gray-700">Title</span>
            </Column>
            {schema.map((property) => (
              <Column
                key={property.name}
                id={property.name}
                allowsSorting
              >
                <span className="text-xs font-semibold text-gray-700">{property.name}</span>
              </Column>
            ))}
            <Column id="add-property" width={140}>
              <DialogTrigger>
                <Button
                  intent="ghost"
                  size="sm"
                  className="text-xs"
                >
                  + Add property
                </Button>
                <Popover placement="bottom end" className="w-[340px] p-0">
                  <div className="p-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">Add property</h3>
                  </div>
                  <div className="p-3 space-y-3">
                    <div>
                      <label
                        htmlFor="collection-property-name"
                        className="mb-1 block text-xs font-medium text-gray-600"
                      >
                        Property name
                      </label>
                      <input
                        id="collection-property-name"
                        type="text"
                        value={newPropertyName}
                        onChange={(event) => setNewPropertyName(event.target.value)}
                        placeholder="e.g., status, priority, dueDate"
                        className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="collection-property-type"
                        className="mb-1 block text-xs font-medium text-gray-600"
                      >
                        Type
                      </label>
                      <select
                        id="collection-property-type"
                        value={newPropertyType}
                        onChange={(event) =>
                          setNewPropertyType(event.target.value as PropertyDefinition["type"])
                        }
                        className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
                      >
                        {PROPERTY_TYPES.map((propertyType) => (
                          <option key={propertyType.value} value={propertyType.value}>
                            {propertyType.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(newPropertyType === "select" || newPropertyType === "multi-select") && (
                      <div>
                        <label
                          htmlFor="collection-property-options"
                          className="mb-1 block text-xs font-medium text-gray-600"
                        >
                          Options (comma-separated)
                        </label>
                        <input
                          id="collection-property-options"
                          type="text"
                          value={newPropertyOptions}
                          onChange={(event) => setNewPropertyOptions(event.target.value)}
                          placeholder="todo, in-progress, done"
                          className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
                        />
                      </div>
                    )}

                    {newPropertyType === "relation" && (
                      <div>
                        <label
                          htmlFor="collection-property-relation-target"
                          className="mb-1 block text-xs font-medium text-gray-600"
                        >
                          Target collection
                        </label>
                        <select
                          id="collection-property-relation-target"
                          value={newPropertyRelationTargetCollectionId}
                          onChange={(event) =>
                            setNewPropertyRelationTargetCollectionId(event.target.value)
                          }
                          className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
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
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={newPropertyRequired}
                          onChange={(event) => setNewPropertyRequired(event.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Required
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={newPropertyUnique}
                          onChange={(event) => setNewPropertyUnique(event.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Unique
                      </label>
                    </div>

                    {hasDuplicatePropertyName && (
                      <p className="text-xs text-red-600">This property name already exists.</p>
                    )}

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => void handleAddProperty()}
                        disabled={
                          isAddingRowProperty ||
                          !newPropertyName.trim() ||
                          Boolean(hasDuplicatePropertyName)
                        }
                        className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isAddingRowProperty ? "Adding..." : "Add Property"}
                      </button>
                    </div>
                  </div>
                </Popover>
              </DialogTrigger>
            </Column>
          </TableHeader>
          <TableBody
            items={sortedDocuments}
            renderEmptyState={() => (
              <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                <p>No rows yet</p>
                <p className="text-sm text-gray-400">
                  Use "+ New" to add a document to this collection.
                </p>
              </div>
            )}
          >
            {(document) => (
              <Row id={document.id}>
                <Cell>
                  <EditableTitle
                    title={document.title}
                    documentId={document.id}
                    organizationSlug={organizationSlug}
                    onSave={handleRenameDocument}
                  />
                </Cell>
                {schema.map((property) => (
                  <Cell key={property.name}>
                    <EditableField
                      value={document.properties[property.name]}
                      fieldDef={property}
                      documentId={document.id}
                      relationOptions={relationOptionsByField.get(property.name) ?? []}
                      onSave={(newValue) => {
                        if (!document.collectionId) {
                          return;
                        }
                        void handleFieldUpdate(
                          document.id,
                          document.collectionId,
                          property.name,
                          newValue,
                        );
                      }}
                    />
                  </Cell>
                ))}
                <Cell>
                  <span className="block h-6 w-[120px]" aria-hidden="true" />
                </Cell>
              </Row>
            )}
          </TableBody>
        </Table>

        <div className="px-3 py-1">
          <button
            type="button"
            onClick={() => void handleCreateRow()}
            disabled={isCreatingRow}
            className="w-full text-left text-sm text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingRow ? "Creating row..." : "+ New"}
          </button>
        </div>
      </div>

      <div
        className={`fixed dark left-1/2 -translate-x-1/2 bottom-4 z-50 bg-black/95 border border-white/20 rounded-[10px] shadow-popover p-1 flex items-center gap-1 transition-all duration-200 ${
          selectedRowCount > 0
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
          <p className="text-xs font-medium text-white ml-2">
            {selectedRowCount} {selectedRowCount === 1 ? "row" : "rows"} selected
          </p>
          <Button intent="ghost" size="sm" onPress={handleDeleteSelectedRows}>
            Delete selected
          </Button>
        </div>
      </div>
    </div>
  );
}

const EditableTitle = memo(function EditableTitle({
  title,
  documentId,
  organizationSlug,
  onSave,
}: {
  title: string;
  documentId: string;
  organizationSlug: string;
  onSave: (documentId: string, title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  const startEditing = () => {
    setEditValue(title);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editValue !== title) {
      onSave(documentId, editValue);
    }
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="group flex min-w-[220px] items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium text-gray-900 hover:bg-white hover:text-blue-600"
        >
          <span>{title || "Untitled"}</span>
        </button>
        <Link
          to="/w/$organizationSlug/$id"
          params={{ organizationSlug, id: documentId }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="opacity-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
          title="Open document"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </Link>
      </div>
    );
  }

  return (
    <input
      type="text"
      value={editValue}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          insertSpaceAtCursor(e.currentTarget, setEditValue);
          return;
        }

        e.stopPropagation();
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") setIsEditing(false);
      }}
      className="w-full min-w-[220px] rounded px-2 py-1.5 text-sm font-medium"
    />
  );
});

const EditableField = memo(function EditableField({
  value,
  fieldDef,
  documentId,
  relationOptions,
  onSave,
}: {
  value: string | number | boolean | null | undefined;
  fieldDef: PropertyDefinition;
  documentId: string;
  relationOptions: Array<{ id: string; title: string }>;
  onSave: (value: string | number | boolean | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(String(value ?? ""));

  const relationLabel = useMemo(() => {
    if (fieldDef.type !== "relation" || typeof value !== "string") {
      return null;
    }

    return relationOptions.find((option) => option.id === value)?.title ?? "Missing record";
  }, [fieldDef.type, relationOptions, value]);

  const availableRelationOptions = useMemo(
    () => relationOptions.filter((option) => option.id !== documentId),
    [documentId, relationOptions],
  );

  const startEditing = () => {
    setEditValue(String(value ?? ""));
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave(toFieldValue(fieldDef, editValue));
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          startEditing();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-gray-100"
      >
        {value !== null && value !== undefined ? (
          fieldDef.type === "relation" ? (relationLabel ?? "Missing record") : String(value)
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </button>
    );
  }

  if (fieldDef.type === "relation") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const nextValue = e.target.value === "" ? null : e.target.value;
          onSave(nextValue);
          setIsEditing(false);
        }}
        onBlur={() => setIsEditing(false)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="">-</option>
        {availableRelationOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
          </option>
        ))}
      </select>
    );
  }

  if ((fieldDef.type === "select" || fieldDef.type === "multi-select") && fieldDef.options) {
    return (
      <select
        value={editValue}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const newValue = e.target.value === "" ? null : e.target.value;
          onSave(newValue);
          setIsEditing(false);
        }}
        onBlur={() => setIsEditing(false)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="">-</option>
        {fieldDef.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={
        fieldDef.type === "date" ? "datetime-local" : fieldDef.type === "number" ? "number" : "text"
      }
      value={editValue}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === " " && fieldDef.type !== "number" && fieldDef.type !== "date") {
          e.preventDefault();
          e.stopPropagation();
          insertSpaceAtCursor(e.currentTarget, setEditValue);
          return;
        }

        e.stopPropagation();
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") setIsEditing(false);
      }}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
    />
  );
});

function insertSpaceAtCursor(
  input: HTMLInputElement,
  setValue: (value: string | ((previousValue: string) => string)) => void,
) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const nextValue = `${input.value.slice(0, start)} ${input.value.slice(end)}`;

  setValue(nextValue);

  requestAnimationFrame(() => {
    input.setSelectionRange(start + 1, start + 1);
  });
}
