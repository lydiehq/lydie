import type { PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { useZero } from "@/services/zero";

type DocumentItem = {
  id: string;
  title: string;
  collectionSchemaId: string | null;
  properties: Record<string, string | number | boolean | null>;
};

const columnHelper = createColumnHelper<DocumentItem>();
const documentsByCollectionQuery = queries.collections.documentsByCollection as any;
const updateFieldValuesMutator = mutators.collection.updateFieldValues as any;
const createDocumentMutator = mutators.document.create as any;
const updateSchemaMutator = mutators.collection.updateSchema as any;
const renameDocumentMutator = mutators.document.rename as any;

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

function extractFieldValues(
  fieldValues: unknown,
  collectionId: string,
): { collectionSchemaId: string | null; values: Record<string, string | number | boolean | null> } {
  const parsedFieldValues = (fieldValues || []) as Array<{
    collection_schema_id: string;
    values: unknown;
    collectionSchema?: { document_id?: string };
  }>;

  if (parsedFieldValues.length === 0) {
    return { collectionSchemaId: null, values: {} };
  }

  const activeRow =
    parsedFieldValues.find((row) => row.collectionSchema?.document_id === collectionId) ??
    parsedFieldValues[0];
  const values = activeRow?.values;

  return {
    collectionSchemaId: activeRow?.collection_schema_id ?? null,
    values:
      typeof values === "object" && values !== null
        ? (values as Record<string, string | number | boolean | null>)
        : {},
  };
}

export function RecordsTable({ collectionId, organizationId, organizationSlug, schema }: Props) {
  const z = useZero();
  console.log("hi");
  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<PropertyDefinition["type"]>("text");
  const [isCreatingRow, setIsCreatingRow] = useState(false);
  const [isAddingRowProperty, setIsAddingRowProperty] = useState(false);
  const [documentsResult] = useQuery(
    collectionId
      ? documentsByCollectionQuery({
          organizationId,
          collectionId,
        })
      : null,
  );

  const documents = useMemo(() => {
    const documentsData = (documentsResult ?? []) as any[];
    return documentsData.map((doc) => {
      const extracted = extractFieldValues(doc.fieldValues, collectionId);
      return {
        id: doc.id,
        title: doc.title,
        collectionSchemaId: extracted.collectionSchemaId,
        properties: extracted.values,
      } satisfies DocumentItem;
    });
  }, [collectionId, documentsResult]);

  const handleFieldUpdate = useCallback(
    async (
      documentId: string,
      collectionSchemaId: string,
      field: string,
      value: string | number | boolean | null,
    ) => {
      await z.mutate(
        updateFieldValuesMutator({
          documentId,
          collectionSchemaId,
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
        createDocumentMutator({
          id: createId(),
          organizationId,
          parentId: collectionId,
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
        renameDocumentMutator({
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
        updateSchemaMutator({
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

  const columns = useMemo(() => {
    return [
      columnHelper.accessor("title", {
        id: "title",
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</span>
        ),
        cell: ({ row, getValue }) => (
          <EditableTitle
            title={getValue()}
            documentId={row.original.id}
            organizationSlug={organizationSlug}
            onSave={handleRenameDocument}
          />
        ),
      }),
      ...schema.map((fieldDef) =>
        columnHelper.display({
          id: fieldDef.name,
          header: () => (
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {fieldDef.name}
            </span>
          ),
          cell: ({ row }) => (
            <EditableField
              value={row.original.properties[fieldDef.name]}
              fieldDef={fieldDef}
              onSave={(newValue) => {
                if (!row.original.collectionSchemaId) {
                  return;
                }
                void handleFieldUpdate(
                  row.original.id,
                  row.original.collectionSchemaId,
                  fieldDef.name,
                  newValue,
                );
              }}
            />
          ),
        }),
      ),
      columnHelper.display({
        id: "add-property",
        header: () => (
          <button
            type="button"
            onClick={() => setIsAddingProperty((value) => !value)}
            className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700"
            title="Add property"
          >
            + Add property
          </button>
        ),
        cell: () => <span className="block h-6 w-[120px]" aria-hidden="true" />,
      }),
    ];
  }, [handleFieldUpdate, handleRenameDocument, organizationSlug, schema]);

  const table = useReactTable({
    data: documents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const hasDuplicatePropertyName = schema.some(
    (property) => property.name.toLowerCase() === newPropertyName.trim().toLowerCase(),
  );

  return (
    <div className="w-full">
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
                autoFocus
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
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-200">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2.5 text-left align-middle">
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
                  <td key={cell.id} className="px-3 py-2.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2.5" colSpan={schema.length + 2}>
                <button
                  type="button"
                  onClick={() => void handleCreateRow()}
                  disabled={isCreatingRow}
                  className="w-full text-left text-sm text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingRow ? "Creating row..." : "+ New"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {documents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-gray-500">
          <p>No rows yet</p>
          <p className="text-sm text-gray-400">Use "+ New" to add a document to this collection.</p>
        </div>
      )}
    </div>
  );
}

function EditableTitle({
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
          onClick={startEditing}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium text-gray-900 hover:bg-white hover:text-blue-600"
        >
          <span>{title || "Untitled"}</span>
        </button>
        <Link
          to="/w/$organizationSlug/$id"
          params={{ organizationSlug, id: documentId }}
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
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") setIsEditing(false);
      }}
      className="w-full min-w-[220px] rounded border border-gray-300 px-2 py-1.5 text-sm font-medium"
      autoFocus
    />
  );
}

function EditableField({
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
    let newValue: string | number | boolean | null = editValue;

    if (fieldDef.type === "boolean") {
      newValue = editValue === "true";
    } else if (fieldDef.type === "number") {
      newValue = editValue === "" ? null : Number(editValue);
    } else if (fieldDef.type === "date") {
      newValue = editValue === "" ? null : editValue;
    } else if (editValue === "") {
      newValue = null;
    }

    onSave(newValue);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={startEditing}
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
        onChange={(e) => {
          const newValue = e.target.value === "" ? null : e.target.value;
          onSave(newValue);
          setIsEditing(false);
        }}
        onBlur={() => setIsEditing(false)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        autoFocus
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
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") setIsEditing(false);
      }}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      autoFocus
    />
  );
}
