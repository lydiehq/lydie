import type { PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Cell, Column, Row, Table, TableHeader } from "@lydie/ui/components/generic/Table";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useState } from "react";
import { TableBody, type Selection, type SortDescriptor } from "react-aria-components";
import { toast } from "sonner";

import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { buildCollectionRoutes } from "@/utils/collection-routes";

type DocumentItem = {
  id: string;
  title: string;
  parentId: string | null;
  collectionId: string | null;
  route: string;
  properties: Record<string, string | number | boolean | null>;
};

type TableColumn =
  | {
      id: "title";
      kind: "title";
      label: "Title";
      isRowHeader: true;
    }
  | {
      id: string;
      kind: "property";
      label: string;
      property: PropertyDefinition;
      isRowHeader: false;
    }
  | {
      id: "route";
      kind: "route";
      label: "Route";
      isRowHeader: false;
    }
  | {
      id: "add-property";
      kind: "add-property";
      label: "Add property";
      isRowHeader: false;
    };

const QUICK_PROPERTY_TYPES: Array<{ label: string; value: PropertyDefinition["type"] }> = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Checkbox", value: "boolean" },
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

export function RecordsTable({ collectionId, organizationId, organizationSlug, schema }: Props) {
  const z = useZero();
  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<PropertyDefinition["type"]>("text");
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

  const documents = useMemo(() => {
    const documentsData = (documentsResult ?? []) as any[];
    const mapped = documentsData.map((doc) => {
      const extracted = extractFieldValues(doc.fieldValues, collectionId);
      return {
        id: doc.id,
        title: doc.title,
        parentId: doc.parent_id ?? null,
        collectionId: extracted.collectionId,
        route: "/",
        properties: extracted.values,
      } satisfies DocumentItem;
    });

    const routeMap = buildCollectionRoutes(
      mapped.map((document) => ({
        id: document.id,
        parentId: document.parentId,
        title: document.title,
        slug: typeof document.properties.slug === "string" ? document.properties.slug : null,
      })),
    );

    return mapped.map((document) => ({
      ...document,
      route: routeMap.get(document.id) ?? "/",
    }));
  }, [collectionId, documentsResult]);

  const isRoutingEnabled = useMemo(
    () => schema.some((property) => property.name.toLowerCase() === "route"),
    [schema],
  );

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
          required: false,
          unique: false,
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
      setIsAddingProperty(false);
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

  const columns = useMemo<TableColumn[]>(() => {
    const schemaColumns = schema
      .filter((property) => property.name.toLowerCase() !== "route")
      .map((property) => ({
        id: property.name,
        kind: "property" as const,
        label: property.name,
        property,
        isRowHeader: false as const,
      }));

    return [
      { id: "title", kind: "title", label: "Title", isRowHeader: true },
      ...(isRoutingEnabled
        ? [{ id: "route", kind: "route", label: "Route", isRowHeader: false } as const]
        : []),
      ...schemaColumns,
      { id: "add-property", kind: "add-property", label: "Add property", isRowHeader: false },
    ];
  }, [isRoutingEnabled, schema]);

  const activeSortColumn = useMemo(
    () => columns.find((tableColumn) => String(tableColumn.id) === String(sortDescriptor.column)),
    [columns, sortDescriptor.column],
  );

  const sortedDocuments = useMemo(() => {
    const sorted = [...documents];

    if (!activeSortColumn || activeSortColumn.kind === "add-property") {
      return sorted;
    }

    const direction = sortDescriptor.direction === "descending" ? -1 : 1;

    sorted.sort((a, b) => {
      let first: string | number | boolean | null | undefined;
      let second: string | number | boolean | null | undefined;

      if (activeSortColumn.kind === "title") {
        first = a.title;
        second = b.title;
      } else if (activeSortColumn.kind === "route") {
        first = a.route;
        second = b.route;
      } else {
        first = a.properties[activeSortColumn.property.name];
        second = b.properties[activeSortColumn.property.name];
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
  }, [activeSortColumn, documents, sortDescriptor.direction]);

  const selectedRowCount = selectedDocumentIds.length;

  const hasDuplicatePropertyName = schema.some(
    (property) => property.name.toLowerCase() === newPropertyName.trim().toLowerCase(),
  );

  return (
    <div className={`w-full ${selectedRowCount > 0 ? "pb-24" : ""}`}>
      {isAddingProperty && (
        <div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label
                htmlFor="records-table-property-name"
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                Property name
              </label>
              <input
                id="records-table-property-name"
                type="text"
                value={newPropertyName}
                onChange={(event) => setNewPropertyName(event.target.value)}
                placeholder="e.g. Status"
                className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="records-table-property-type"
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                Type
              </label>
              <select
                id="records-table-property-type"
                value={newPropertyType}
                onChange={(event) =>
                  setNewPropertyType(event.target.value as PropertyDefinition["type"])
                }
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
              >
                {QUICK_PROPERTY_TYPES.map((propertyType) => (
                  <option key={propertyType.value} value={propertyType.value}>
                    {propertyType.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-[1px]">
              <button
                type="button"
                onClick={() => void handleAddProperty()}
                disabled={
                  isAddingRowProperty ||
                  !newPropertyName.trim() ||
                  Boolean(hasDuplicatePropertyName)
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAddingRowProperty ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setIsAddingProperty(false)}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
          {hasDuplicatePropertyName && (
            <p className="mt-2 text-xs text-red-600">This property name already exists.</p>
          )}
        </div>
      )}

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
          <TableHeader columns={columns}>
            {(column) => (
              <Column
                id={column.id}
                isRowHeader={column.isRowHeader}
                width={column.kind === "add-property" ? 140 : "1fr"}
                allowsSorting={column.kind !== "add-property"}
              >
                {column.kind === "add-property" ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingProperty((value) => !value)}
                    className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700"
                    title="Add property"
                  >
                    + Add property
                  </button>
                ) : (
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {column.label}
                  </span>
                )}
              </Column>
            )}
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
              <Row id={document.id} columns={columns}>
                {(column) => (
                  <Cell className="px-3 py-1 align-middle">
                    {column.kind === "title" && (
                      <EditableTitle
                        title={document.title}
                        documentId={document.id}
                        organizationSlug={organizationSlug}
                        onSave={handleRenameDocument}
                      />
                    )}
                    {column.kind === "property" && (
                      <EditableField
                        value={document.properties[column.property.name]}
                        fieldDef={column.property}
                        onSave={(newValue) => {
                          if (!document.collectionId) {
                            return;
                          }
                          void handleFieldUpdate(
                            document.id,
                            document.collectionId,
                            column.property.name,
                            newValue,
                          );
                        }}
                      />
                    )}
                    {column.kind === "route" && (
                      <span className="block rounded px-2 py-1 text-xs font-mono text-gray-600">
                        {document.route}
                      </span>
                    )}
                    {column.kind === "add-property" && (
                      <span className="block h-6 w-[120px]" aria-hidden="true" />
                    )}
                  </Cell>
                )}
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
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
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
  onSave,
}: {
  value: string | number | boolean | null | undefined;
  fieldDef: PropertyDefinition;
  onSave: (value: string | number | boolean | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(String(value ?? ""));

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
          String(value)
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </button>
    );
  }

  if ((fieldDef.type === "select" || fieldDef.type === "multi-select") && fieldDef.options) {
    return (
      <select
        value={editValue}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
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
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") setIsEditing(false);
      }}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
    />
  );
});
