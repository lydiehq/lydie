import { MoreHorizontalRegular } from "@fluentui/react-icons";
import {
  resolveRelationTargetCollectionId,
  type PropertyDefinition,
  type PropertyOption,
  type PropertyOptionStage,
} from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Checkbox } from "@lydie/ui/components/generic/Checkbox";
import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { Select as PropertySelect, SelectItem } from "@lydie/ui/components/generic/Select";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { DataGridNav } from "@table-nav/core";
import { Link } from "@tanstack/react-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DialogTrigger, Input, MenuTrigger, Button as RACButton } from "react-aria-components";
import { toast } from "sonner";

import { confirmDialog } from "@/atoms/confirm-dialog";
import { MultiSelectCellEditor } from "@/components/database-table/cells/MultiSelectCellEditor";
import { SelectCellEditor } from "@/components/database-table/cells/SelectCellEditor";
import { TextCellEditor } from "@/components/database-table/cells/TextCellEditor";
import { sortNullableValues as compareSortValues } from "@/components/database-table/logic/sorting";
import {
  getEditableValue,
  isFreeformField,
  toFieldValue,
} from "@/components/database-table/logic/value-normalization";
import {
  initialTableCellState,
  tableCellStateReducer,
  type EditingCell,
} from "@/components/database-table/state/reducers";
import { useGlobalBulkActions } from "@/hooks/use-global-bulk-actions";
import { useZero } from "@/services/zero";
import { focusVisibleStyles } from "@/utils/focus-ring";

type DocumentItem = {
  id: string;
  title: string;
  parentId: string | null;
  collectionId: string | null;
  properties: Record<string, string | number | boolean | string[] | null>;
};

type RowSelectionState = Record<string, boolean>;
type SortingState = Array<{ id: string; desc: boolean }>;
type ColumnKind = "title" | "property" | "selection" | "add-property";

type TableMeta = {
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
};

type TableColumn = {
  id: string;
  size: number;
  sortable: boolean;
  meta?: {
    kind?: ColumnKind;
    fieldDef?: PropertyDefinition;
  };
  header: () => ReactNode;
};

type TableCellContext = {
  row: {
    id: string;
    index: number;
    original: DocumentItem;
  };
  column: {
    id: string;
    columnDef: {
      meta?: {
        kind?: ColumnKind;
        fieldDef?: PropertyDefinition;
      };
    };
  };
  table: {
    options: {
      meta: TableMeta;
    };
  };
};

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

const OPTION_COLORS = [
  { value: "gray", label: "Gray" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
] as const;

type EnumOptionDraft = {
  id: string;
  label: string;
  color: string;
  stage?: PropertyOptionStage;
};

type StatusOption = {
  id: string;
  label: string;
  color: string;
  order: number;
  stage: PropertyOptionStage;
};

type SelectOption = {
  id: string;
  label: string;
  color: string;
  order: number;
};

type OptionColor = {
  dot: string;
  pill: string;
  text: string;
};

const DEFAULT_COLOR = "gray";

const OPTION_COLOR_CLASSNAMES: Record<string, OptionColor> = {
  gray: {
    dot: "bg-gray-500",
    pill: "bg-gray-100 border-gray-200",
    text: "text-gray-700",
  },
  red: {
    dot: "bg-red-500",
    pill: "bg-red-100 border-red-200",
    text: "text-red-700",
  },
  orange: {
    dot: "bg-orange-500",
    pill: "bg-orange-100 border-orange-200",
    text: "text-orange-700",
  },
  yellow: {
    dot: "bg-yellow-500",
    pill: "bg-yellow-100 border-yellow-200",
    text: "text-yellow-700",
  },
  green: {
    dot: "bg-green-500",
    pill: "bg-green-100 border-green-200",
    text: "text-green-700",
  },
  blue: {
    dot: "bg-blue-500",
    pill: "bg-blue-100 border-blue-200",
    text: "text-blue-700",
  },
  purple: {
    dot: "bg-purple-500",
    pill: "bg-purple-100 border-purple-200",
    text: "text-purple-700",
  },
  pink: {
    dot: "bg-pink-500",
    pill: "bg-pink-100 border-pink-200",
    text: "text-pink-700",
  },
};

const STATUS_STAGE_LABELS: Record<PropertyOptionStage, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

const DEFAULT_STATUS_OPTION_DRAFTS: EnumOptionDraft[] = [
  {
    id: createId(),
    label: "To do",
    color: "gray",
    stage: "NOT_STARTED",
  },
  {
    id: createId(),
    label: "In progress",
    color: "blue",
    stage: "IN_PROGRESS",
  },
  {
    id: createId(),
    label: "Done",
    color: "green",
    stage: "COMPLETE",
  },
];

type Props = {
  collectionId: string;
  organizationId: string;
  organizationSlug: string;
  schema: PropertyDefinition[];
  showCreateRowButton?: boolean;
  onCreateRow?: () => void;
};

const SYSTEM_COLUMN_IDS = {
  selection: "__selection",
  title: "__title",
  addProperty: "__add-property",
} as const;

function createDefaultEnumOptions(type: PropertyDefinition["type"]): EnumOptionDraft[] {
  if (type === "status") {
    return DEFAULT_STATUS_OPTION_DRAFTS.map((option) => ({
      ...option,
      id: createId(),
    }));
  }

  if (type === "select" || type === "multi-select") {
    return [{ id: createId(), label: "", color: DEFAULT_COLOR }];
  }

  return [];
}

function getOptionColor(color: string | null | undefined): OptionColor {
  return OPTION_COLOR_CLASSNAMES[color ?? DEFAULT_COLOR] ?? OPTION_COLOR_CLASSNAMES[DEFAULT_COLOR];
}

function normalizeOptionColor(color: string | null | undefined): string {
  return OPTION_COLOR_CLASSNAMES[color ?? ""] ? (color as string) : DEFAULT_COLOR;
}

function buildStatusOptions(options: EnumOptionDraft[]): StatusOption[] {
  return options
    .map((option, index) => ({
      id: option.id,
      label: option.label.trim(),
      color: normalizeOptionColor(option.color),
      order: index,
      stage: option.stage,
    }))
    .filter((option): option is StatusOption => option.label.length > 0 && option.stage !== undefined);
}

function buildSelectOptions(options: EnumOptionDraft[]): SelectOption[] {
  return options
    .map((option, index) => ({
      id: option.id,
      label: option.label.trim(),
      color: normalizeOptionColor(option.color),
      order: index,
    }))
    .filter((option) => option.label.length > 0);
}

function buildEnumOptions(
  type: PropertyDefinition["type"],
  options: EnumOptionDraft[],
): StatusOption[] | SelectOption[] | undefined {
  if (type === "status") {
    return buildStatusOptions(options);
  }

  if (type === "select" || type === "multi-select") {
    return buildSelectOptions(options);
  }

  return undefined;
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

export function CollectionTableView({
  collectionId,
  organizationId,
  organizationSlug,
  schema,
  showCreateRowButton = true,
  onCreateRow,
}: Props) {
  const z = useZero();
  const [sorting, setSorting] = useState<SortingState>([
    { id: SYSTEM_COLUMN_IDS.title, desc: false },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [cellState, dispatchCellState] = useReducer(tableCellStateReducer, initialTableCellState);
  const editingCell = cellState.editingCell;
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
      relationMany,
    }: {
      name: string;
      type: PropertyDefinition["type"];
      options: EnumOptionDraft[];
      required: boolean;
      unique: boolean;
      relationTargetCollectionId: string;
      relationMany: boolean;
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

      const enumOptions = buildEnumOptions(type, options);

      if ((type === "select" || type === "multi-select" || type === "status") && !enumOptions) {
        return false;
      }

      if (
        (type === "select" || type === "multi-select" || type === "status") &&
        (enumOptions?.length ?? 0) === 0
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
                  ...(relationMany ? { many: true } : {}),
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

  const handleUpdateEnumPropertyOptions = useCallback(
    async (propertyName: string, options: EnumOptionDraft[]) => {
      const nextSchema = schema.map((property) => {
        if (property.name !== propertyName) {
          return property;
        }

        if (property.type === "status") {
          const nextOptions = buildStatusOptions(options);

          return {
            ...property,
            options: nextOptions,
          };
        }

        if (property.type === "select" || property.type === "multi-select") {
          const nextOptions = buildSelectOptions(options);

          return {
            ...property,
            options: nextOptions,
          };
        }

        return property;
      });

      await z.mutate(
        mutators.collection.update({
          collectionId,
          organizationId,
          properties: nextSchema,
        }),
      );
    },
    [collectionId, organizationId, schema, z],
  );

  const sortState = sorting[0];
  const sortedDocuments = useMemo(() => {
    if (!sortState?.id) {
      return documents;
    }

    const next = [...documents];
    next.sort((first, second) => {
      const firstValue =
        sortState.id === SYSTEM_COLUMN_IDS.title ? first.title : first.properties[sortState.id];
      const secondValue =
        sortState.id === SYSTEM_COLUMN_IDS.title ? second.title : second.properties[sortState.id];
      const result = compareSortValues(firstValue, secondValue);
      return sortState.desc ? -result : result;
    });
    return next;
  }, [documents, sortState]);

  const startEditing = useCallback(
    (rowId: string, columnId: string, seed?: string) => {
      tableNav.disable();
      dispatchCellState({ type: "startEdit", rowId, columnId, seed });
    },
    [tableNav],
  );

  const stopEditing = useCallback(() => {
    const lastEditedCell = editingCell;
    dispatchCellState({ type: "stopEdit" });
    tableNav.enable();
    if (lastEditedCell) {
      requestAnimationFrame(() => {
        focusCell(lastEditedCell.rowId, lastEditedCell.columnId);
      });
    }
  }, [editingCell, focusCell, tableNav]);

  const updateData = useCallback(
    (rowIndex: number, columnId: string, value: string | number | boolean | string[] | null) => {
      const document = sortedDocuments[rowIndex];
      if (!document) {
        return;
      }

      if (columnId === SYSTEM_COLUMN_IDS.title) {
        void handleRenameDocument(document.id, String(value ?? ""));
        return;
      }

      if (!document.collectionId) {
        return;
      }

      void handleFieldUpdate(document.id, document.collectionId, columnId, value);
    },
    [handleFieldUpdate, handleRenameDocument, sortedDocuments],
  );

  const tableMeta = useMemo<TableMeta>(
    () => ({
      editingCell,
      startEditing,
      stopEditing,
      updateData,
      tableNav,
      organizationSlug,
      relationOptionsByField,
    }),
    [
      editingCell,
      organizationSlug,
      relationOptionsByField,
      startEditing,
      stopEditing,
      tableNav,
      updateData,
    ],
  );

  const allRowsSelected =
    sortedDocuments.length > 0 &&
    sortedDocuments.every((document) => Boolean(rowSelection[document.id]));
  const someRowsSelected =
    sortedDocuments.some((document) => Boolean(rowSelection[document.id])) && !allRowsSelected;

  const toggleSorting = useCallback((columnId: string) => {
    setSorting((previous) => {
      const current = previous[0];
      if (!current || current.id !== columnId) {
        return [{ id: columnId, desc: false }];
      }
      return [{ id: columnId, desc: !current.desc }];
    });
  }, []);

  const columns = useMemo<TableColumn[]>(
    () => [
      {
        id: SYSTEM_COLUMN_IDS.selection,
        size: 32,
        sortable: false,
        meta: { kind: "selection" },
        header: () => (
          <Checkbox
            aria-label="Select all rows"
            isSelected={allRowsSelected}
            isIndeterminate={someRowsSelected}
            onChange={(isSelected) => {
              const next = Boolean(isSelected);
              setRowSelection(
                Object.fromEntries(sortedDocuments.map((document) => [document.id, next])),
              );
            }}
            className="justify-center"
          />
        ),
      },
      {
        id: SYSTEM_COLUMN_IDS.title,
        size: 300,
        sortable: true,
        meta: { kind: "title" },
        header: () => (
          <SortableHeader
            label="Title"
            sortable
            sortDirection={
              sortState?.id === SYSTEM_COLUMN_IDS.title ? (sortState.desc ? "desc" : "asc") : false
            }
            onToggle={() => toggleSorting(SYSTEM_COLUMN_IDS.title)}
          />
        ),
      },
      ...schema.map((property) => ({
        id: property.name,
        size: 240,
        sortable: true,
        meta: { kind: "property" as const, fieldDef: property },
        header: () => (
          <PropertyHeader
            fieldDef={property}
            label={property.name}
            sortDirection={
              sortState?.id === property.name ? (sortState.desc ? "desc" : "asc") : false
            }
            onToggleSort={() => toggleSorting(property.name)}
            onDeleteProperty={handleDeleteProperty}
            onUpdateEnumPropertyOptions={handleUpdateEnumPropertyOptions}
          />
        ),
      })),
      {
        id: SYSTEM_COLUMN_IDS.addProperty,
        size: 140,
        sortable: false,
        meta: { kind: "add-property" },
        header: () => (
          <AddPropertyHeader
            collectionId={collectionId}
            collections={collections}
            schema={schema}
            onAddProperty={handleAddProperty}
          />
        ),
      },
    ],
    [
      allRowsSelected,
      collectionId,
      collections,
      handleAddProperty,
      handleDeleteProperty,
      handleUpdateEnumPropertyOptions,
      schema,
      someRowsSelected,
      sortState,
      sortedDocuments,
      toggleSorting,
    ],
  );

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
              width: columns.reduce((sum, column) => sum + column.size, 0),
            }}
          >
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    style={{ width: column.size }}
                    className={`relative border-b border-r border-gray-200 p-0 text-left align-middle last:border-r-0 ${
                      column.id === SYSTEM_COLUMN_IDS.selection ? "text-center" : ""
                    }`}
                  >
                    <div
                      className={`flex min-h-9 items-center px-3 py-1 ${
                        column.id === SYSTEM_COLUMN_IDS.selection ? "justify-center" : ""
                      }`}
                    >
                      {column.header()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedDocuments.length === 0 ? (
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
                sortedDocuments.map((document, rowIndex, rows) => (
                  <tr key={document.id} className={rowSelection[document.id] ? "bg-gray-50" : ""}>
                    {columns.map((column) => {
                      const cellContext: TableCellContext = {
                        row: { id: document.id, index: rowIndex, original: document },
                        column: {
                          id: column.id,
                          columnDef: {
                            meta: column.meta,
                          },
                        },
                        table: {
                          options: {
                            meta: tableMeta,
                          },
                        },
                      };
                      const kind = column.meta?.kind;
                      const fieldDef = column.meta?.fieldDef;

                      const content =
                        kind === "selection" ? (
                          <Checkbox
                            aria-label="Select row"
                            isSelected={Boolean(rowSelection[document.id])}
                            onChange={(isSelected) =>
                              setRowSelection((previous) => ({
                                ...previous,
                                [document.id]: Boolean(isSelected),
                              }))
                            }
                            className="justify-center"
                          />
                        ) : kind === "add-property" ? (
                          <span className="block h-6 w-[120px]" aria-hidden="true" />
                        ) : (
                          <EditableGridCell context={cellContext} />
                        );

                      return (
                        <td
                          key={`${document.id}:${column.id}`}
                          ref={(node) => setCellRef(document.id, column.id, node)}
                          style={{ width: column.size }}
                          tabIndex={0}
                          onClick={(event) => {
                            if (kind !== "title" && kind !== "property") {
                              return;
                            }

                            if (isInteractiveTarget(event.target)) {
                              return;
                            }

                            const activeEdit = tableMeta.editingCell;
                            if (
                              activeEdit?.rowId === document.id &&
                              activeEdit?.columnId === column.id
                            ) {
                              return;
                            }

                            const shouldAutoOpenPicker =
                              kind === "property" && fieldDef && !isFreeformField(fieldDef);

                            tableMeta.startEditing(
                              document.id,
                              column.id,
                              shouldAutoOpenPicker ? "__open__" : undefined,
                            );
                          }}
                          onKeyDown={(event) => {
                            if (kind !== "title" && kind !== "property") {
                              return;
                            }

                            const activeEdit = tableMeta.editingCell;
                            if (
                              activeEdit?.rowId === document.id &&
                              activeEdit?.columnId === column.id
                            ) {
                              return;
                            }

                            const canTypeEdit = kind === "title" || isFreeformField(fieldDef);
                            if (isPrintableKey(event) && canTypeEdit) {
                              event.preventDefault();
                              tableMeta.startEditing(document.id, column.id, event.key);
                              return;
                            }

                            if (
                              (event.key === "Backspace" || event.key === "Delete") &&
                              canTypeEdit
                            ) {
                              event.preventDefault();
                              tableMeta.startEditing(document.id, column.id, "");
                              return;
                            }

                            if (event.key === "Enter") {
                              event.preventDefault();
                              tableMeta.startEditing(
                                document.id,
                                column.id,
                                kind === "property" && fieldDef && !isFreeformField(fieldDef)
                                  ? "__open__"
                                  : undefined,
                              );
                            }
                          }}
                          className={`overflow-hidden border-b border-r border-gray-200 p-0 align-middle last:border-r-0 transition-colors hover:bg-gray-50 ${
                            rowIndex === rows.length - 1 ? "border-b-0" : ""
                          } ${focusVisibleStyles}`}
                        >
                          {content}
                        </td>
                      );
                    })}
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
  label,
  sortable,
  sortDirection,
  onToggle,
}: {
  label: string;
  sortable: boolean;
  sortDirection: "asc" | "desc" | false;
  onToggle: () => void;
}) {
  if (!sortable) {
    return <span className="block truncate text-xs font-semibold text-gray-700">{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
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
  fieldDef,
  label,
  sortDirection,
  onToggleSort,
  onDeleteProperty,
  onUpdateEnumPropertyOptions,
}: {
  fieldDef: PropertyDefinition;
  label: string;
  sortDirection: "asc" | "desc" | false;
  onToggleSort: () => void;
  onDeleteProperty: (propertyName: string) => void;
  onUpdateEnumPropertyOptions: (propertyName: string, options: EnumOptionDraft[]) => Promise<void>;
}) {
  const isEnumField =
    fieldDef.type === "select" || fieldDef.type === "multi-select" || fieldDef.type === "status";

  return (
    <div className="flex items-center justify-between gap-1">
      <div className="min-w-0 flex-1">
        <SortableHeader
          label={label}
          sortable
          sortDirection={sortDirection}
          onToggle={onToggleSort}
        />
      </div>
      <div className="flex items-center gap-1">
        {isEnumField ? (
          <EditEnumPropertyOptionsDialog
            propertyName={fieldDef.name}
            propertyType={fieldDef.type}
            options={fieldDef.options ?? []}
            onSave={onUpdateEnumPropertyOptions}
          />
        ) : null}

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
    </div>
  );
});

const EditEnumPropertyOptionsDialog = memo(function EditEnumPropertyOptionsDialog({
  propertyName,
  propertyType,
  options,
  onSave,
}: {
  propertyName: string;
  propertyType: PropertyDefinition["type"];
  options: PropertyOption[];
  onSave: (propertyName: string, options: EnumOptionDraft[]) => Promise<void>;
}) {
  const [draftOptions, setDraftOptions] = useState<EnumOptionDraft[]>(
    options.map((option) => ({
      id: option.id,
      label: option.label,
      color: normalizeOptionColor(option.color),
      stage: option.stage,
    })),
  );

  const handleReset = useCallback(() => {
    setDraftOptions(
      options.map((option) => ({
        id: option.id,
        label: option.label,
        color: normalizeOptionColor(option.color),
        stage: option.stage,
      })),
    );
  }, [options]);

  const handleSubmit = useCallback(async () => {
    await onSave(propertyName, draftOptions);
    toast.success(`Updated ${propertyName} options`);
  }, [draftOptions, onSave, propertyName]);

  return (
    <DialogTrigger>
      <Button intent="ghost" size="sm" className="h-7 px-2 text-[11px]">
        Options
      </Button>
      <Popover placement="bottom end" className="w-[360px] p-0">
        <div className="border-b border-gray-200 p-3">
          <h3 className="text-sm font-semibold text-gray-900">Edit options: {propertyName}</h3>
        </div>
        <div className="space-y-3 p-3">
          <div className="space-y-2">
            {draftOptions.map((option, index) => (
              <div key={option.id} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  {option.stage ? (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      {STATUS_STAGE_LABELS[option.stage]}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Option {index + 1}
                    </span>
                  )}

                  {propertyType !== "status" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftOptions((prev) => prev.filter((item) => item.id !== option.id))
                      }
                      className="text-xs text-gray-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <Input
                    value={option.label}
                    onChange={(event) =>
                      setDraftOptions((prev) =>
                        prev.map((item) =>
                          item.id === option.id ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Label"
                    className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ${focusVisibleStyles}`}
                  />

                  <select
                    value={normalizeOptionColor(option.color)}
                    onChange={(event) =>
                      setDraftOptions((prev) =>
                        prev.map((item) =>
                          item.id === option.id ? { ...item, color: event.target.value } : item,
                        ),
                      )
                    }
                    className={`w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm ${focusVisibleStyles}`}
                  >
                    {OPTION_COLORS.map((color) => (
                      <option key={color.value} value={color.value}>
                        {color.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            {draftOptions.length === 0 ? (
              <p className="text-xs text-gray-500">Add at least one option.</p>
            ) : null}
          </div>

          {propertyType !== "status" ? (
            <button
              type="button"
              onClick={() =>
                setDraftOptions((prev) => [
                  ...prev,
                  { id: createId(), label: "", color: DEFAULT_COLOR },
                ])
              }
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              + Add option
            </button>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button intent="ghost" size="sm" onPress={handleReset}>
              Reset
            </Button>
            <Button intent="secondary" size="sm" onPress={() => void handleSubmit()}>
              Save options
            </Button>
          </div>
        </div>
      </Popover>
    </DialogTrigger>
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
    options: EnumOptionDraft[];
    required: boolean;
    unique: boolean;
    relationTargetCollectionId: string;
    relationMany: boolean;
  }) => Promise<boolean>;
}) {
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<PropertyDefinition["type"]>("text");
  const [newPropertyOptions, setNewPropertyOptions] = useState<EnumOptionDraft[]>([]);
  const [newPropertyRequired, setNewPropertyRequired] = useState(false);
  const [newPropertyUnique, setNewPropertyUnique] = useState(false);
  const [newPropertyRelationTargetCollectionId, setNewPropertyRelationTargetCollectionId] =
    useState<string>("self");
  const [newPropertyRelationMany, setNewPropertyRelationMany] = useState(false);

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
      relationMany: newPropertyRelationMany,
    });

    if (!didAdd) {
      return;
    }

    setNewPropertyName("");
    setNewPropertyType("text");
    setNewPropertyOptions([]);
    setNewPropertyRequired(false);
    setNewPropertyUnique(false);
    setNewPropertyRelationTargetCollectionId("self");
    setNewPropertyRelationMany(false);
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
              onChange={(event) => {
                const nextType = event.target.value as PropertyDefinition["type"];
                setNewPropertyType(nextType);
                setNewPropertyOptions(createDefaultEnumOptions(nextType));
              }}
              className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ${focusVisibleStyles}`}
            >
              {PROPERTY_TYPES.map((propertyType) => (
                <option key={propertyType.value} value={propertyType.value}>
                  {propertyType.label}
                </option>
              ))}
            </select>
          </div>

          {(newPropertyType === "select" ||
            newPropertyType === "multi-select" ||
            newPropertyType === "status") && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="block text-xs font-medium text-gray-600">Options</p>
                {newPropertyType !== "status" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setNewPropertyOptions((prev) => [
                        ...prev,
                        { id: createId(), label: "", color: DEFAULT_COLOR },
                      ])
                    }
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    + Add option
                  </button>
                ) : null}
              </div>

              <div className="space-y-2">
                {newPropertyOptions.map((option, index) => (
                  <div key={option.id} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      {option.stage ? (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          {STATUS_STAGE_LABELS[option.stage]}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Option {index + 1}
                        </span>
                      )}
                      {newPropertyType !== "status" ? (
                        <button
                          type="button"
                          onClick={() =>
                            setNewPropertyOptions((prev) =>
                              prev.filter((item) => item.id !== option.id),
                            )
                          }
                          className="text-xs text-gray-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-[1fr_120px] gap-2">
                      <Input
                        value={option.label}
                        onChange={(event) =>
                          setNewPropertyOptions((prev) =>
                            prev.map((item) =>
                              item.id === option.id ? { ...item, label: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="Label"
                        className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ${focusVisibleStyles}`}
                      />

                      <select
                        value={normalizeOptionColor(option.color)}
                        onChange={(event) =>
                          setNewPropertyOptions((prev) =>
                            prev.map((item) =>
                              item.id === option.id ? { ...item, color: event.target.value } : item,
                            ),
                          )
                        }
                        className={`w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm ${focusVisibleStyles}`}
                      >
                        {OPTION_COLORS.map((color) => (
                          <option key={color.value} value={color.value}>
                            {color.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}

                {newPropertyOptions.length === 0 ? (
                  <p className="text-xs text-gray-500">Add at least one option.</p>
                ) : null}
              </div>
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
              <div className="mt-2">
                <Checkbox
                  isSelected={newPropertyRelationMany}
                  onChange={(isSelected) => setNewPropertyRelationMany(Boolean(isSelected))}
                  className="text-xs text-gray-600"
                >
                  Allow multiple related records
                </Checkbox>
              </div>
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

function OptionChip({ option }: { option: PropertyOption }) {
  const color = getOptionColor(option.color);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color.pill} ${color.text}`}
    >
      <span className={`size-1.5 rounded-full ${color.dot}`} aria-hidden />
      {option.label}
    </span>
  );
}

function OptionPickerLabel({ option }: { option: PropertyOption }) {
  const color = getOptionColor(option.color);

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-2 rounded-full ${color.dot}`} aria-hidden />
      <span>{option.label}</span>
    </span>
  );
}

function EditableGridCell({ context }: { context: TableCellContext }) {
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
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (!isEditing || editingCell?.seed !== "__open__") {
      return;
    }

    requestAnimationFrame(() => {
      if (fieldDef?.type === "relation" && fieldDef.relation?.many) {
        menuTriggerRef.current?.click();
      }
    });
  }, [editingCell?.seed, fieldDef, isEditing]);

  if (isEditing) {
    if (fieldDef?.type === "relation") {
      const relationMany = fieldDef.relation?.many === true;
      const selectedRelationValues = Array.isArray(currentValue)
        ? currentValue.filter((entry): entry is string => typeof entry === "string")
        : typeof currentValue === "string"
          ? [currentValue]
          : [];

      if (relationMany) {
        return (
          <MenuTrigger>
            <RACButton
              type="button"
              ref={menuTriggerRef}
              autoFocus
              aria-label={`${fieldDef.name} values`}
              className="flex min-h-9 w-full items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-left text-sm"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  stopEditing();
                }
              }}
            >
              {selectedRelationValues.length > 0
                ? `${selectedRelationValues.length} selected`
                : "Select records"}
            </RACButton>
            <Menu
              selectionMode="multiple"
              selectedKeys={new Set(selectedRelationValues)}
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  return;
                }

                const normalized = Array.from(keys)
                  .map((key) => String(key))
                  .filter(Boolean);
                meta?.updateData(row.index, column.id, normalized);
                stopEditing();
              }}
            >
              {availableRelationOptions.map((option) => (
                <MenuItem key={option.id} id={option.id} textValue={option.title}>
                  {option.title}
                </MenuItem>
              ))}
            </Menu>
          </MenuTrigger>
        );
      }

      return (
        <PropertySelect
          autoFocus
          aria-label={`${fieldDef.name} value`}
          selectedKey={typeof currentValue === "string" ? currentValue : null}
          placeholder="Select a record"
          className="w-full"
          onSelectionChange={(nextValue) => {
            const valueAsString = typeof nextValue === "string" ? nextValue : null;
            meta?.updateData(row.index, column.id, valueAsString);
            stopEditing();
          }}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              stopEditing();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              stopEditing();
            }
          }}
        >
          <SelectItem key="__empty__" id="" textValue="-">
            -
          </SelectItem>
          {availableRelationOptions.map((option) => (
            <SelectItem key={option.id} id={option.id} textValue={option.title}>
              {option.title}
            </SelectItem>
          ))}
        </PropertySelect>
      );
    }

    if ((fieldDef?.type === "select" || fieldDef?.type === "status") && fieldDef.options) {
      return (
        <SelectCellEditor
          aria-label={`${fieldDef.name} value`}
          options={fieldDef.options}
          selectedKey={typeof currentValue === "string" ? currentValue : null}
          onCommit={(value) => {
            meta?.updateData(row.index, column.id, value);
            stopEditing();
          }}
          onCancel={stopEditing}
          renderOption={(option) => <OptionPickerLabel option={option} />}
        />
      );
    }

    if (fieldDef?.type === "multi-select" && fieldDef.options) {
      const selectedValues = Array.isArray(currentValue)
        ? currentValue.filter((entry): entry is string => typeof entry === "string")
        : typeof currentValue === "string"
          ? [currentValue]
          : [];

      return (
        <MultiSelectCellEditor
          aria-label={`${fieldDef.name} values`}
          options={fieldDef.options}
          selectedValues={selectedValues}
          onCommit={(value) => {
            meta?.updateData(row.index, column.id, value);
            stopEditing();
          }}
          onCancel={stopEditing}
          renderOption={(option) => <OptionPickerLabel option={option} />}
        />
      );
    }

    return (
      <TextCellEditor
        type={
          fieldDef?.type === "date"
            ? "datetime-local"
            : fieldDef?.type === "number"
              ? "number"
              : "text"
        }
        initialValue={value}
        onCommit={(nextValue) => {
          setValue(nextValue);
          if (kind === "title") {
            if (nextValue !== row.original.title) {
              meta?.updateData(row.index, column.id, nextValue);
            }
            stopEditing();
            return;
          }
          if (!fieldDef) {
            stopEditing();
            return;
          }
          const nextFieldValue = toFieldValue(fieldDef, nextValue);
          if (nextFieldValue !== currentValue) {
            meta?.updateData(row.index, column.id, nextFieldValue);
          }
          stopEditing();
        }}
        onCancel={stopEditing}
      />
    );
  }

  const relationValueIds =
    fieldDef?.type === "relation"
      ? Array.isArray(currentValue)
        ? currentValue.filter((entry): entry is string => typeof entry === "string")
        : typeof currentValue === "string"
          ? [currentValue]
          : []
      : [];

  const relationLabels =
    fieldDef?.type === "relation"
      ? relationValueIds.map(
          (relationValueId) =>
            relationOptions.find((option) => option.id === relationValueId)?.title ??
            "Missing record",
        )
      : null;

  const enumOptionById =
    fieldDef?.type === "select" || fieldDef?.type === "multi-select" || fieldDef?.type === "status"
      ? new Map((fieldDef.options ?? []).map((option) => [option.id, option]))
      : null;

  const enumDisplay =
    fieldDef?.type === "multi-select" && Array.isArray(currentValue)
      ? currentValue
          .map((entry) => (typeof entry === "string" ? enumOptionById?.get(entry) : undefined))
          .filter((option): option is PropertyOption => Boolean(option))
      : typeof currentValue === "string"
        ? (enumOptionById?.get(currentValue) ?? null)
        : null;

  const content =
    kind === "title" ? (
      <span className="font-medium text-gray-900">{row.original.title || "Untitled"}</span>
    ) : currentValue !== null && currentValue !== undefined ? (
      fieldDef?.type === "relation" ? (
        relationLabels && relationLabels.length > 0 ? (
          relationLabels.join(", ")
        ) : (
          <span className="text-gray-400">-</span>
        )
      ) : Array.isArray(enumDisplay) ? (
        enumDisplay.length > 0 ? (
          <div className="flex flex-wrap gap-1 py-0.5">
            {enumDisplay.map((option) => (
              <OptionChip key={option.id} option={option} />
            ))}
          </div>
        ) : (
          <span className="text-gray-400">-</span>
        )
      ) : enumDisplay ? (
        <OptionChip option={enumDisplay} />
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
        <span className="block w-full">{content}</span>
      </div>
    </div>
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
