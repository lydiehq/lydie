import { resolveRelationTargetCollectionId, type PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Checkbox } from "@lydie/ui/components/generic/Checkbox";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { DataGridNav } from "@table-nav/core";
import { Link } from "@tanstack/react-router";
import {
  type CellContext,
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowData,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DialogTrigger } from "react-aria-components";
import { toast } from "sonner";

import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { focusVisibleStyles } from "@/utils/focus-ring";

type DocumentItem = {
  id: string;
  title: string;
  slug: string | null;
  parentId: string | null;
  collectionId: string | null;
  properties: Record<string, string | number | boolean | null>;
};

type EditingCell = {
  rowId: string;
  columnId: string;
  seed?: string;
} | null;

declare module "@tanstack/react-table" {
  // eslint-disable-next-line no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    kind?: "title" | "property" | "selection" | "add-property";
    fieldDef?: PropertyDefinition;
  }

  // eslint-disable-next-line no-unused-vars
  interface TableMeta<TData extends RowData> {
    editingCell: EditingCell;
    startEditing: (rowId: string, columnId: string, seed?: string) => void;
    stopEditing: () => void;
    updateData: (
      rowIndex: number,
      columnId: string,
      value: string | number | boolean | null,
    ) => void;
    tableNav: DataGridNav;
    organizationSlug: string;
    relationOptionsByField: Map<string, Array<{ id: string; title: string }>>;
  }
}

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
  const [sorting, setSorting] = useState<SortingState>([{ id: "title", desc: false }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const tableNav = useMemo(() => new DataGridNav(), []);
  const listeners = useMemo(
    () => ({
      onKeyDown: (event: React.KeyboardEvent<HTMLTableElement>) =>
        tableNav.tableKeyDown(event.nativeEvent),
      onKeyUp: () => tableNav.tableKeyUp(),
    }),
    [tableNav],
  );

  const getCellKey = useCallback((rowId: string, columnId: string) => `${rowId}::${columnId}`, []);

  const setCellRef = useCallback(
    (rowId: string, columnId: string, node: HTMLTableCellElement | null) => {
      const key = getCellKey(rowId, columnId);
      if (node) {
        cellRefs.current.set(key, node);
        return;
      }
      cellRefs.current.delete(key);
    },
    [getCellKey],
  );

  const focusCell = useCallback(
    (rowId: string, columnId: string) => {
      const key = getCellKey(rowId, columnId);
      cellRefs.current.get(key)?.focus();
    },
    [getCellKey],
  );
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

  const handleAddProperty = useCallback(async () => {
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
  }, [
    collectionId,
    newPropertyName,
    newPropertyOptions,
    newPropertyRelationTargetCollectionId,
    newPropertyRequired,
    newPropertyType,
    newPropertyUnique,
    organizationId,
    schema,
    z,
  ]);

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

      const targetCollectionId = resolveRelationTargetCollectionId(property.relation, collectionId);
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

  const hasDuplicatePropertyName = schema.some(
    (property) => property.name.toLowerCase() === newPropertyName.trim().toLowerCase(),
  );

  const columns = useMemo<ColumnDef<DocumentItem>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableResizing: false,
        meta: { kind: "selection" as const },
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows"
            isSelected={table.getIsAllRowsSelected()}
            isIndeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
            onChange={(isSelected) => table.toggleAllRowsSelected(Boolean(isSelected))}
            className="justify-center"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            isSelected={row.getIsSelected()}
            onChange={(isSelected) => row.toggleSelected(Boolean(isSelected))}
            className="justify-center"
          />
        ),
      },
      {
        id: "title",
        accessorKey: "title",
        enableSorting: true,
        sortingFn: sortNullableValues,
        meta: { kind: "title" as const },
        header: ({ column }) => <SortableHeader column={column} label="Title" />,
        cell: (context) => <EditableGridCell context={context} />,
      },
      ...schema.map(
        (property): ColumnDef<DocumentItem> => ({
          id: property.name,
          accessorFn: (document: DocumentItem) => document.properties[property.name],
          enableSorting: true,
          sortingFn: sortNullableValues,
          meta: { kind: "property" as const, fieldDef: property },
          header: ({ column }) => <SortableHeader column={column} label={property.name} />,
          cell: (context: CellContext<DocumentItem, unknown>) => (
            <EditableGridCell context={context} />
          ),
        }),
      ),
      {
        id: "add-property",
        enableSorting: false,
        meta: { kind: "add-property" as const },
        header: () => (
          <DialogTrigger>
            <Button intent="ghost" size="sm" className="text-xs">
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
        ),
        cell: () => <span className="block h-6 w-[120px]" aria-hidden="true" />,
      },
    ],
    [
      collectionId,
      collections,
      handleAddProperty,
      hasDuplicatePropertyName,
      isAddingRowProperty,
      newPropertyName,
      newPropertyOptions,
      newPropertyRelationTargetCollectionId,
      newPropertyRequired,
      newPropertyType,
      newPropertyUnique,
      schema,
    ],
  );

  const table = useReactTable({
    data: documents,
    columns,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      editingCell,
      startEditing: (rowId, columnId, seed) => {
        tableNav.disable();
        setEditingCell({ rowId, columnId, seed });
      },
      stopEditing: () => {
        const lastEditedCell = editingCell;
        setEditingCell(null);
        tableNav.enable();
        if (lastEditedCell) {
          requestAnimationFrame(() => {
            focusCell(lastEditedCell.rowId, lastEditedCell.columnId);
          });
        }
      },
      updateData: (rowIndex, columnId, value) => {
        const document = documents[rowIndex];
        if (!document) {
          return;
        }

        if (columnId === "title") {
          void handleRenameDocument(document.id, String(value ?? ""));
          return;
        }

        if (!document.collectionId) {
          return;
        }

        void handleFieldUpdate(document.id, document.collectionId, columnId, value);
      },
      tableNav,
      organizationSlug,
      relationOptionsByField,
    },
  });

  const selectedDocumentIds = useMemo(() => {
    const existingIds = new Set(documents.map((document) => document.id));
    return Object.entries(rowSelection)
      .filter(([id, isSelected]) => isSelected && existingIds.has(id))
      .map(([id]) => id);
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

            setRowSelection({});
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

  const selectedRowCount = selectedDocumentIds.length;

  return (
    <div className={`w-full ${selectedRowCount > 0 ? "pb-24" : ""}`}>
      <div className="overflow-x-auto">
        <table
          aria-label="Collection records"
          role="grid"
          {...listeners}
          className="w-full max-h-none border-collapse"
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className="border border-gray-200 bg-white px-3 py-2 text-left align-middle"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="border border-gray-200">
                  <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                    <p>No rows yet</p>
                    <p className="text-sm text-gray-400">
                      Use "+ New" to add a document to this collection.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={row.getIsSelected() ? "bg-gray-50" : ""}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      ref={(node) => setCellRef(row.id, cell.column.id, node)}
                      tabIndex={0}
                      onDoubleClick={() => {
                        const kind = cell.column.columnDef.meta?.kind;
                        if (kind !== "title" && kind !== "property") {
                          return;
                        }
                        table.options.meta?.startEditing(row.id, cell.column.id);
                      }}
                      onKeyDown={(event) => {
                        const kind = cell.column.columnDef.meta?.kind;
                        if (kind !== "title" && kind !== "property") {
                          return;
                        }

                        const activeEdit = table.options.meta?.editingCell;
                        if (
                          activeEdit?.rowId === row.id &&
                          activeEdit.columnId === cell.column.id
                        ) {
                          return;
                        }

                        const fieldDef = cell.column.columnDef.meta?.fieldDef;
                        const canTypeEdit = kind === "title" || isFreeformField(fieldDef);
                        if (isPrintableKey(event) && canTypeEdit) {
                          event.preventDefault();
                          table.options.meta?.startEditing(row.id, cell.column.id, event.key);
                          return;
                        }

                        if ((event.key === "Backspace" || event.key === "Delete") && canTypeEdit) {
                          event.preventDefault();
                          table.options.meta?.startEditing(row.id, cell.column.id, "");
                          return;
                        }

                        if (event.key === "Enter") {
                          event.preventDefault();
                          table.options.meta?.startEditing(row.id, cell.column.id);
                        }
                      }}
                      className={`border border-gray-200 p-0 align-middle ${focusVisibleStyles}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

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

const SortableHeader = memo(function SortableHeader({
  column,
  label,
}: {
  column: Column<DocumentItem, unknown>;
  label: string;
}) {
  const sortDirection = column.getIsSorted();

  if (!column.getCanSort()) {
    return <span className="text-xs font-semibold text-gray-700">{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sortDirection === "asc")}
      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700"
    >
      <span>{label}</span>
      <span className="text-[10px] text-gray-400">
        {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : ""}
      </span>
    </button>
  );
});

const EditableGridCell = memo(function EditableGridCell({
  context,
}: {
  context: CellContext<DocumentItem, unknown>;
}) {
  const { row, column, table } = context;
  const meta = table.options.meta;
  const editingCell = meta?.editingCell ?? null;
  const isEditing = editingCell?.rowId === row.id && editingCell.columnId === column.id;

  const kind = column.columnDef.meta?.kind;
  const fieldDef = column.columnDef.meta?.fieldDef;
  const currentValue = kind === "title" ? row.original.title : row.original.properties[column.id];
  const relationOptions = meta?.relationOptionsByField.get(column.id) ?? [];
  const availableRelationOptions = relationOptions.filter(
    (option) => option.id !== row.original.id,
  );

  const [value, setValue] = useState(getEditableValue(fieldDef, currentValue));

  useEffect(() => {
    if (!isEditing) {
      setValue(getEditableValue(fieldDef, currentValue));
      return;
    }

    if (editingCell?.seed !== undefined && (kind === "title" || isFreeformField(fieldDef))) {
      setValue(editingCell.seed);
      return;
    }

    setValue(getEditableValue(fieldDef, currentValue));
  }, [currentValue, editingCell?.seed, fieldDef, isEditing, kind]);

  const stopEditing = () => {
    meta?.stopEditing();
  };

  const commit = () => {
    if (kind === "title") {
      if (value !== row.original.title) {
        meta?.updateData(row.index, column.id, value);
      }
      stopEditing();
      return;
    }

    if (!fieldDef) {
      stopEditing();
      return;
    }

    const nextValue = toFieldValue(fieldDef, value);
    if (nextValue !== currentValue) {
      meta?.updateData(row.index, column.id, nextValue);
    }
    stopEditing();
  };

  if (isEditing) {
    if (fieldDef?.type === "relation") {
      return (
        <select
          autoFocus
          value={typeof currentValue === "string" ? currentValue : ""}
          onChange={(event) => {
            const nextValue = event.target.value === "" ? null : event.target.value;
            meta?.updateData(row.index, column.id, nextValue);
            stopEditing();
          }}
          onBlur={stopEditing}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              stopEditing();
            }
          }}
          className="h-10 w-full rounded-none border-0 bg-transparent px-3 py-1.5 text-sm"
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

    if ((fieldDef?.type === "select" || fieldDef?.type === "multi-select") && fieldDef.options) {
      return (
        <select
          autoFocus
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            meta?.updateData(row.index, column.id, nextValue === "" ? null : nextValue);
            stopEditing();
          }}
          onBlur={stopEditing}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              stopEditing();
            }
          }}
          className="h-10 w-full rounded-none border-0 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">-</option>
          {fieldDef.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        autoFocus
        type={
          fieldDef?.type === "date"
            ? "datetime-local"
            : fieldDef?.type === "number"
              ? "number"
              : "text"
        }
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            stopEditing();
          }
        }}
        className="h-10 w-full rounded-none border-0 bg-transparent px-3 py-1.5 text-sm"
      />
    );
  }

  const relationLabel =
    fieldDef?.type === "relation" && typeof currentValue === "string"
      ? (relationOptions.find((option) => option.id === currentValue)?.title ?? "Missing record")
      : null;

  const content =
    kind === "title" ? (
      <span className="font-medium text-gray-900">{row.original.title || "Untitled"}</span>
    ) : currentValue !== null && currentValue !== undefined ? (
      fieldDef?.type === "relation" ? (
        (relationLabel ?? "Missing record")
      ) : (
        String(currentValue)
      )
    ) : (
      <span className="text-gray-400">-</span>
    );

  return (
    <div className="group flex min-h-10 min-w-[220px] items-center gap-2 px-3 py-1.5">
      <div className="flex flex-1 items-center text-left text-sm">{content}</div>
      {kind === "title" ? (
        <Link
          to="/w/$organizationSlug/$id"
          params={{ organizationSlug: meta?.organizationSlug ?? "", id: row.original.id }}
          onClick={(event) => event.stopPropagation()}
          tabIndex={-1}
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
      ) : null}
    </div>
  );
});

function getEditableValue(
  fieldDef: PropertyDefinition | undefined,
  value: string | number | boolean | null | undefined,
): string {
  if (fieldDef?.type === "boolean") {
    return value === true ? "true" : value === false ? "false" : "";
  }
  return value === null || value === undefined ? "" : String(value);
}

function isFreeformField(fieldDef: PropertyDefinition | undefined): boolean {
  if (!fieldDef) {
    return true;
  }

  return (
    fieldDef.type === "text" ||
    fieldDef.type === "number" ||
    fieldDef.type === "date" ||
    fieldDef.type === "boolean"
  );
}

function isPrintableKey(event: React.KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function sortNullableValues(
  rowA: { getValue: (columnId: string) => unknown },
  rowB: { getValue: (columnId: string) => unknown },
  columnId: string,
): number {
  const first = rowA.getValue(columnId) as string | number | boolean | null | undefined;
  const second = rowB.getValue(columnId) as string | number | boolean | null | undefined;

  if (first == null && second == null) {
    return 0;
  }
  if (first == null) {
    return 1;
  }
  if (second == null) {
    return -1;
  }

  if (typeof first === "number" && typeof second === "number") {
    return first - second;
  }

  if (typeof first === "boolean" && typeof second === "boolean") {
    return Number(first) - Number(second);
  }

  return String(first).localeCompare(String(second), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
