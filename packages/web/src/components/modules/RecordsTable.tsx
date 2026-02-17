import type { FieldDefinition } from "@lydie/core/database";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useZero } from "@/services/zero";

type DocumentItem = {
  id: string;
  title: string;
  properties: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  parentId: string;
  organizationId: string;
  organizationSlug: string;
  schema: FieldDefinition[];
};

export function RecordsTable({ parentId, organizationId, organizationSlug, schema }: Props) {
  const z = useZero();
  const [documentsResult] = useQuery(
    queries.database.childrenByParent({ organizationId, parentId }),
  );

  const documents: DocumentItem[] =
    documentsResult?.map((doc) => ({
      id: doc.id,
      title: doc.title,
      properties: (doc.properties || {}) as Record<string, string | number | boolean | null>,
      createdAt: new Date(doc.created_at).toISOString(),
      updatedAt: new Date(doc.updated_at).toISOString(),
    })) || [];

  const handleFieldUpdate = async (
    documentId: string,
    field: string,
    value: string | number | boolean | null,
  ) => {
    await z.mutate(
      mutators.document.updateProperties({
        documentId,
        organizationId,
        properties: { [field]: value },
      }),
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
            {schema.map((fieldDef) => (
              <th key={fieldDef.field} className="px-4 py-3 text-left font-medium text-gray-600">
                {fieldDef.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
            >
              <td className="px-4 py-3">
                <Link
                  to="/w/$organizationSlug/$id"
                  params={{ organizationSlug, id: doc.id }}
                  className="group flex items-center gap-2 font-medium text-gray-900 hover:text-blue-600"
                >
                  {doc.title || "Untitled"}
                  <span className="opacity-0 transition-opacity group-hover:opacity-100">→</span>
                </Link>
              </td>
              {schema.map((fieldDef) => (
                <td key={fieldDef.field} className="px-4 py-3">
                  <EditableField
                    value={doc.properties[fieldDef.field]}
                    fieldDef={fieldDef}
                    onSave={(newValue) => handleFieldUpdate(doc.id, fieldDef.field, newValue)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {documents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <p>No documents yet</p>
          <p className="text-sm text-gray-400">
            Create documents under this module to see them here
          </p>
        </div>
      )}
    </div>
  );
}

function EditableField({
  value,
  fieldDef,
  onSave,
}: {
  value: string | number | boolean | null | undefined;
  fieldDef: FieldDefinition;
  onSave: (value: string | number | boolean | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(String(value ?? ""));

  const handleSave = () => {
    let newValue: string | number | boolean | null = editValue;

    if (fieldDef.type === "boolean") {
      newValue = editValue === "true";
    } else if (fieldDef.type === "datetime") {
      newValue = editValue;
    }

    onSave(newValue);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer rounded px-2 py-1 hover:bg-gray-100"
      >
        {value ? String(value) : <span className="text-gray-400">-</span>}
      </div>
    );
  }

  if (fieldDef.type === "select" && fieldDef.options) {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => {
          onSave(e.target.value);
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
      type={fieldDef.type === "datetime" ? "datetime-local" : "text"}
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
