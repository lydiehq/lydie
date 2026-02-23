import { MoreHorizontalRegular } from "@fluentui/react-icons";
import {
  resolveRelationTargetCollectionId,
  type PropertyDefinition,
  type PropertyOption,
} from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Checkbox } from "@lydie/ui/components/generic/Checkbox";
import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
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
import { DialogTrigger, Input, MenuTrigger, Button as RACButton } from "react-aria-components";
import { toast } from "sonner";

import { useGlobalBulkActions } from "@/hooks/use-global-bulk-actions";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { focusVisibleStyles } from "@/utils/focus-ring";

type DocumentItem = {
  id: string;
  title: string;
  slug: string | null;
  parentId: string | null;
  collectionId: string | null;
  properties: Record<string, string | number | boolean | string[] | null>;
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
      value: string | number | boolean | string[] | null,
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
  { label: "Status", value: "status" },
  { label: "Multi Select", value: "multi-select" },
  { label: "Date", value: "date" },
  { label: "Checkbox", value: "boolean" },
  { label: "Relation", value: "relation" },
];

const DEFAULT_STATUS_OPTIONS: PropertyOption[] = [
  { id: createId(), label: "To do", order: 0, stage: "NOT_STARTED" },
  { id: createId(), label: "In progress", order: 1, stage: "IN_PROGRESS" },
  { id: createId(), label: "Done", order: 2, stage: "COMPLETE" },
];

type Props = {
  collectionId: string;
  organizationId: string;
  organizationSlug: string;
  schema: PropertyDefinition[];
  showCreateRowButton?: boolean;
  onCreateRow?: () => void;
};

function toFieldValue(
  fieldDef: PropertyDefinition,
  value: string,
): string | number | boolean | string[] | null {
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
): {
  collectionId: string | null;
  values: Record<string, string | number | boolean | string[] | null>;
} {
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
        ? (values as Record<string, string | number | boolean | string[] | null>)
        : {},
  };
}

export function CollectionTable({
  collectionId,
  organizationId,
  organizationSlug,
  schema,
  showCreateRowButton = true,
  onCreateRow,
}: Props) {
  const z = useZero();
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
      value: string | number | boolean | string[] | null,
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

  const handleCreateRow = () => {
    z.mutate(
      mutators.document.create({
        id: createId(),
        organizationId,
        collectionId,
        title: "",
      }),
    );
  };

  const createRow = onCreateRow ?? handleCreateRow;

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

  const handleAddProperty = useCallback(
    async ({
      name,
      type,
      options,
      required,
      unique,
      relationTargetCollectionId,
    }: {
      name: string;
      type: PropertyDefinition["type"];
      options: string;
      required: boolean;
      unique: boolean;
      relationTargetCollectionId: string;
    }) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return false;
      }

      const nameExists = schema.some(
        (property) => property.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (nameExists) {
        return false;
      }

      const enumOptions =
        type === "status"
          ? DEFAULT_STATUS_OPTIONS.map((option) => ({ ...option }))
          : type === "select" || type === "multi-select"
            ? options
                .split(",")
                .map((option) => option.trim())
                .filter(Boolean)
                .map((label, index) => ({
                  id: createId(),
                  label,
                  order: index,
                }))
            : undefined;

      if (
        (type === "select" || type === "multi-select") &&
        (!enumOptions || enumOptions.length === 0)
      ) {
        return false;
      }

      const nextSchema: PropertyDefinition[] = [
        ...schema,
        {
          name: trimmedName,
          type,
          required,
          unique,
          ...(enumOptions ? { options: enumOptions } : {}),
          ...(type === "relation"
            ? {
                relation: {
                  targetCollectionId: relationTargetCollectionId,
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

      return true;
    },
    [collectionId, organizationId, schema, z],
  );

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

  const handleDeleteProperty = useCallback(
    (propertyName: string) => {
      confirmDialog({
        title: `Delete property "${propertyName}"?`,
        message: "This will remove the property from the collection schema.",
        onConfirm: () => {
          void (async () => {
            try {
              await z.mutate(
                mutators.collection.update({
                  collectionId,
                  organizationId,
                  properties: schema.filter((property) => property.name !== propertyName),
                }),
              );
              toast.success(`Deleted "${propertyName}"`);
            } catch (error) {
              console.error(error);
              toast.error("Failed to delete property");
            }
          })();
        },
      });
    },
    [collectionId, organizationId, schema, z],
  );

  const columns = useMemo<ColumnDef<DocumentItem>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableResizing: false,
        size: 32,
        minSize: 32,
        maxSize: 32,
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
        size: 300,
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
          enableResizing: true,
          size: 240,
          sortingFn: sortNullableValues,
          meta: { kind: "property" as const, fieldDef: property },
          header: ({ column }) => (
            <PropertyHeader
              column={column}
              label={property.name}
              onDeleteProperty={handleDeleteProperty}
            />
          ),
          cell: (context: CellContext<DocumentItem, unknown>) => (
            <EditableGridCell context={context} />
          ),
        }),
      ),
      {
        id: "add-property",
        enableSorting: false,
        enableResizing: false,
        size: 140,
        meta: { kind: "add-property" as const },
        header: () => (
          <AddPropertyHeader
            collectionId={collectionId}
            collections={collections}
            schema={schema}
            onAddProperty={handleAddProperty}
          />
        ),
        cell: () => <span className="block h-6 w-[120px]" aria-hidden="true" />,
      },
    ],
    [collectionId, collections, handleAddProperty, handleDeleteProperty, schema],
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
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    defaultColumn: {
      minSize: 140,
      size: 240,
      maxSize: 600,
    },
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
                    try {
                      await z.mutate(
                        mutators.document.bulkRestore({
                          documentIds: deletedDocumentIds,
                          organizationId,
                        }),
                      );
                      toast.success("Delete undone");
                    } catch (error) {
                      console.error(error);
                      toast.error("Failed to restore deleted rows");
                    }
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

  const bulkActions = useMemo(
    () => [
      {
        id: "delete-selected",
        label: "Delete selected",
        intent: "danger" as const,
        onAction: handleDeleteSelectedRows,
      },
    ],
    [handleDeleteSelectedRows],
  );

  useGlobalBulkActions({
    selectionCount: selectedDocumentIds.length,
    selectionLabelSingular: "row",
    selectionLabelPlural: "rows",
    actions: bulkActions,
  });

  return (
    <div className="w-full">
      <div className="w-max min-w-full">
        <div>
          <table
            aria-label="Collection records"
            role="grid"
            data-editor-widget-table=""
            {...listeners}
            className="max-h-none border-separate border-spacing-0"
            style={{
              width: table.getTotalSize(),
            }}
          >
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{ width: header.getSize() }}
                      className={`relative border-b border-r border-gray-200 p-0 text-left align-middle last:border-r-0 ${
                        header.column.id === "select" ? "text-center" : ""
                      }`}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex min-h-9 items-center px-3 py-1 ${
                            header.column.id === "select" ? "justify-center" : ""
                          }`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </div>
                      )}
                      {header.column.getCanResize() ? (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${String(header.column.columnDef.header ?? header.id)} column`}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-transparent transition-colors hover:bg-blue-300/60 ${
                            header.column.getIsResizing() ? "bg-blue-500/70" : ""
                          }`}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="border-0">
                    <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                      <p>No rows yet</p>
                      <p className="text-sm text-gray-400">
                        Use "+ New" to add a document to this collection.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, rowIndex, rows) => (
                  <tr key={row.id} className={row.getIsSelected() ? "bg-gray-50" : ""}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        ref={(node) => setCellRef(row.id, cell.column.id, node)}
                        style={{ width: cell.column.getSize() }}
                        tabIndex={0}
                        onClick={(event) => {
                          const kind = cell.column.columnDef.meta?.kind;
                          if (kind !== "title" && kind !== "property") {
                            return;
                          }

                          if (isInteractiveTarget(event.target)) {
                            return;
                          }

                          const activeEdit = table.options.meta?.editingCell;
                          if (
                            activeEdit?.rowId === row.id &&
                            activeEdit.columnId === cell.column.id
                          ) {
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

                          if (
                            (event.key === "Backspace" || event.key === "Delete") &&
                            canTypeEdit
                          ) {
                            event.preventDefault();
                            table.options.meta?.startEditing(row.id, cell.column.id, "");
                            return;
                          }

                          if (event.key === "Enter") {
                            event.preventDefault();
                            table.options.meta?.startEditing(row.id, cell.column.id);
                          }
                        }}
                        className={`overflow-hidden border-b border-r border-gray-200 p-0 align-middle last:border-r-0 transition-colors hover:bg-gray-50 ${
                          rowIndex === rows.length - 1 ? "border-b-0" : ""
                        } ${focusVisibleStyles}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showCreateRowButton ? (
          <div className="px-3 py-1">
            <button
              type="button"
              onClick={createRow}
              className="w-full text-left text-sm text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              New
            </button>
          </div>
        ) : null}
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
    return <span className="block truncate text-xs font-semibold text-gray-700">{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sortDirection === "asc")}
      className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-gray-700"
    >
      <span className="truncate">{label}</span>
      <span className="text-[10px] text-gray-400">
        {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : ""}
      </span>
    </button>
  );
});

const PropertyHeader = memo(function PropertyHeader({
  column,
  label,
  onDeleteProperty,
}: {
  column: Column<DocumentItem, unknown>;
  label: string;
  onDeleteProperty: (propertyName: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <div className="min-w-0 flex-1">
        <SortableHeader column={column} label={label} />
      </div>
      <MenuTrigger>
        <RACButton
          type="button"
          aria-label={`Open ${label} column menu`}
          className="inline-flex shrink-0 items-center rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <MoreHorizontalRegular className="size-4" />
        </RACButton>
        <Menu placement="bottom end">
          <MenuItem onAction={() => onDeleteProperty(label)}>Delete property</MenuItem>
        </Menu>
      </MenuTrigger>
    </div>
  );
});

const AddPropertyHeader = memo(function AddPropertyHeader({
  collectionId,
  collections,
  schema,
  onAddProperty,
}: {
  collectionId: string;
  collections: Array<{ id: string; name: string }> | undefined;
  schema: PropertyDefinition[];
  onAddProperty: (payload: {
    name: string;
    type: PropertyDefinition["type"];
    options: string;
    required: boolean;
    unique: boolean;
    relationTargetCollectionId: string;
  }) => Promise<boolean>;
}) {
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<PropertyDefinition["type"]>("text");
  const [newPropertyOptions, setNewPropertyOptions] = useState("");
  const [newPropertyRequired, setNewPropertyRequired] = useState(false);
  const [newPropertyUnique, setNewPropertyUnique] = useState(false);
  const [newPropertyRelationTargetCollectionId, setNewPropertyRelationTargetCollectionId] =
    useState<string>("self");

  const hasDuplicatePropertyName = schema.some(
    (property) => property.name.toLowerCase() === newPropertyName.trim().toLowerCase(),
  );

  const handleSubmit = async () => {
    const didAdd = await onAddProperty({
      name: newPropertyName,
      type: newPropertyType,
      options: newPropertyOptions,
      required: newPropertyRequired,
      unique: newPropertyUnique,
      relationTargetCollectionId: newPropertyRelationTargetCollectionId,
    });

    if (!didAdd) {
      return;
    }

    setNewPropertyName("");
    setNewPropertyType("text");
    setNewPropertyOptions("");
    setNewPropertyRequired(false);
    setNewPropertyUnique(false);
    setNewPropertyRelationTargetCollectionId("self");
  };

  return (
    <DialogTrigger>
      <Button intent="ghost" size="sm" className="text-xs">
        + Add property
      </Button>
      <Popover placement="bottom end" className="w-[340px] p-0">
        <div className="border-b border-gray-200 p-3">
          <h3 className="text-sm font-semibold text-gray-900">Add property</h3>
        </div>
        <div className="space-y-3 p-3">
          <div>
            <label
              htmlFor="collection-property-name"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Property name
            </label>
            <Input
              id="collection-property-name"
              type="text"
              value={newPropertyName}
              onChange={(event) => setNewPropertyName(event.target.value)}
              placeholder="e.g., status, priority, dueDate"
              className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ${focusVisibleStyles}`}
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
              className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ${focusVisibleStyles}`}
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
              <Input
                id="collection-property-options"
                type="text"
                value={newPropertyOptions}
                onChange={(event) => setNewPropertyOptions(event.target.value)}
                placeholder="todo, in-progress, done"
                className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ${focusVisibleStyles}`}
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
                onChange={(event) => setNewPropertyRelationTargetCollectionId(event.target.value)}
                className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ${focusVisibleStyles}`}
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
            <Checkbox
              isSelected={newPropertyRequired}
              onChange={(isSelected) => setNewPropertyRequired(Boolean(isSelected))}
              className="text-xs text-gray-600"
            >
              Required
            </Checkbox>
            <Checkbox
              isSelected={newPropertyUnique}
              onChange={(isSelected) => setNewPropertyUnique(Boolean(isSelected))}
              className="text-xs text-gray-600"
            >
              Unique
            </Checkbox>
          </div>

          {hasDuplicatePropertyName && (
            <p className="text-xs text-red-600">This property name already exists.</p>
          )}

          <div className="pt-1">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!newPropertyName.trim() || Boolean(hasDuplicatePropertyName)}
              className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Property
            </button>
          </div>
        </div>
      </Popover>
    </DialogTrigger>
  );
});

function EditableGridCell({ context }: { context: CellContext<DocumentItem, unknown> }) {
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
          className={`h-9 w-full rounded-none border-0 bg-transparent px-3 py-1 text-sm ${focusVisibleStyles}`}
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

    if (
      (fieldDef?.type === "select" ||
        fieldDef?.type === "multi-select" ||
        fieldDef?.type === "status") &&
      fieldDef.options
    ) {
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
          className={`h-9 w-full rounded-none border-0 bg-transparent px-3 py-1 text-sm ${focusVisibleStyles}`}
        >
          <option value="">-</option>
          {fieldDef.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <Input
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
        className={`h-9 w-full rounded-none border-0 bg-transparent px-3 py-1 text-sm ${focusVisibleStyles}`}
      />
    );
  }

  const relationLabel =
    fieldDef?.type === "relation" && typeof currentValue === "string"
      ? (relationOptions.find((option) => option.id === currentValue)?.title ?? "Missing record")
      : null;

  const enumLabel =
    typeof currentValue === "string" &&
    (fieldDef?.type === "select" ||
      fieldDef?.type === "multi-select" ||
      fieldDef?.type === "status")
      ? (fieldDef.options?.find((option) => option.id === currentValue)?.label ?? "Unknown option")
      : null;

  const content =
    kind === "title" ? (
      <span className="font-medium text-gray-900">{row.original.title || "Untitled"}</span>
    ) : currentValue !== null && currentValue !== undefined ? (
      fieldDef?.type === "relation" ? (
        (relationLabel ?? "Missing record")
      ) : enumLabel ? (
        enumLabel
      ) : (
        String(currentValue)
      )
    ) : (
      <span className="text-gray-400">-</span>
    );

  return (
    <div className="group flex min-h-9 items-center gap-2 px-3 py-1">
      {kind === "title" ? (
        <Link
          to="/w/$organizationSlug/$id"
          params={{ organizationSlug: meta?.organizationSlug ?? "", id: row.original.id }}
          onClick={(event) => event.stopPropagation()}
          tabIndex={-1}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Open document"
        >
          <DocumentThumbnailIcon className="shrink-0" />
        </Link>
      ) : null}
      <div className="min-w-0 flex flex-1 items-center overflow-hidden text-left text-sm">
        <span className="block w-full truncate whitespace-nowrap">{content}</span>
      </div>
    </div>
  );
}

function getEditableValue(
  fieldDef: PropertyDefinition | undefined,
  value: string | number | boolean | string[] | null | undefined,
): string {
  if (fieldDef?.type === "boolean") {
    return value === true ? "true" : value === false ? "false" : "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
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

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
}

function isPrintableKey(event: React.KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function sortNullableValues(
  rowA: { getValue: (columnId: string) => unknown },
  rowB: { getValue: (columnId: string) => unknown },
  columnId: string,
): number {
  const first = rowA.getValue(columnId) as string | number | boolean | string[] | null | undefined;
  const second = rowB.getValue(columnId) as string | number | boolean | string[] | null | undefined;

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

  if (Array.isArray(first) && Array.isArray(second)) {
    return first.join(",").localeCompare(second.join(","), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  return String(first).localeCompare(String(second), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
