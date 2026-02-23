import { resolveRelationTargetCollectionId, type PropertyDefinition } from "@lydie/core/collection";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";

import { useZero } from "@/services/zero";

type Props = {
  documentId: string;
  organizationId: string;
  collectionId?: string;
  fieldDef: PropertyDefinition;
  value: string | number | boolean | string[] | null;
};

export function InlinePropertyEditor({
  documentId,
  organizationId,
  collectionId,
  fieldDef,
  value,
}: Props) {
  const z = useZero();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(
    value !== null && value !== undefined ? String(value) : "",
  );

  const handleSave = async () => {
    let finalValue: string | number | boolean | null = editValue;

    if (fieldDef.type === "boolean") {
      finalValue = editValue === "true" || editValue === "on";
    } else if (fieldDef.type === "number") {
      finalValue = editValue ? Number(editValue) : null;
    } else if (editValue === "") {
      finalValue = null;
    }

    if (!collectionId) {
      setIsEditing(false);
      return;
    }

    await z.mutate(
      mutators.collection.updateFieldValues({
        documentId,
        collectionId,
        organizationId,
        values: { [fieldDef.name]: finalValue },
      }),
    );

    setIsEditing(false);
  };

  const displayValue =
    value !== null && value !== undefined
      ? Array.isArray(value)
        ? value.join(", ")
        : String(value)
      : null;

  const enumLabel =
    typeof value === "string" &&
    (fieldDef.type === "select" || fieldDef.type === "multi-select" || fieldDef.type === "status")
      ? (fieldDef.options?.find((option) => option.id === value)?.label ?? "Unknown option")
      : null;

  const targetCollectionId =
    fieldDef.type === "relation"
      ? collectionId
        ? resolveRelationTargetCollectionId(fieldDef.relation, collectionId)
        : null
      : null;

  const [relationDocuments] = useQuery(
    fieldDef.type === "relation" && targetCollectionId
      ? queries.collections.documentsByCollection({
          organizationId,
          collectionId: targetCollectionId,
        })
      : null,
  );

  const relationValueLabel =
    fieldDef.type === "relation" && typeof value === "string"
      ? (((relationDocuments ?? []) as Array<{ id: string; title: string }>).find(
          (document) => document.id === value,
        )?.title ?? "Missing record")
      : null;

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="group flex items-start min-h-[28px] rounded-md text-sm transition-colors duration-75 cursor-pointer hover:bg-black/5"
      >
        <div className="flex items-baseline gap-1.5 flex-1 min-w-0 px-2 py-1.5">
          <span className="w-[25%] text-sm font-medium text-gray-900 shrink-0">
            {fieldDef.name}
          </span>
          <span className="flex-1 text-sm text-gray-600 min-w-0">
            {displayValue !== null ? (
              fieldDef.type === "relation" ? (
                relationValueLabel
              ) : enumLabel ? (
                enumLabel
              ) : (
                displayValue
              )
            ) : (
              <span className="text-gray-400 italic">Empty</span>
            )}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="flex items-start min-h-[28px] rounded-md text-sm px-2 py-1.5">
      <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
        <span className="w-[25%] text-sm font-medium text-gray-900 shrink-0">{fieldDef.name}</span>
        <div className="flex-1 min-w-0">
          <FieldInput
            fieldDef={fieldDef}
            value={editValue}
            relationDocuments={
              fieldDef.type === "relation"
                ? ((relationDocuments ?? []) as Array<{ id: string; title: string }>).filter(
                    (document) => document.id !== documentId,
                  )
                : []
            }
            onChange={setEditValue}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  fieldDef,
  value,
  relationDocuments,
  onChange,
  onSave,
  onCancel,
}: {
  fieldDef: PropertyDefinition;
  value: string;
  relationDocuments: Array<{ id: string; title: string }>;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (fieldDef.type === "relation") {
    return (
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onSave();
        }}
        onBlur={onSave}
        className="w-full text-sm bg-transparent border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
        autoFocus
      >
        <option value="">—</option>
        {relationDocuments.map((document) => (
          <option key={document.id} value={document.id}>
            {document.title || "Untitled"}
          </option>
        ))}
      </select>
    );
  }

  if (
    (fieldDef.type === "select" ||
      fieldDef.type === "multi-select" ||
      fieldDef.type === "status") &&
    fieldDef.options
  ) {
    return (
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onSave();
        }}
        onBlur={onSave}
        className="w-full text-sm bg-transparent border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
        autoFocus
      >
        <option value="">—</option>
        {fieldDef.options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (fieldDef.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === "true" || value === "on"}
        onChange={(e) => {
          onChange(e.target.checked ? "true" : "false");
          onSave();
        }}
        className="w-4 h-4 rounded border-gray-300"
        autoFocus
      />
    );
  }

  return (
    <input
      type={
        fieldDef.type === "number" ? "number" : fieldDef.type === "date" ? "datetime-local" : "text"
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onSave}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave();
        if (e.key === "Escape") onCancel();
      }}
      className="w-full text-sm bg-transparent border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
      autoFocus
    />
  );
}
