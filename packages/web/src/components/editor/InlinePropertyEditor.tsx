import type { PropertyDefinition } from "@lydie/core/collection";
import { mutators } from "@lydie/zero/mutators";
import { useState } from "react";

import { useZero } from "@/services/zero";

type Props = {
  documentId: string;
  organizationId: string;
  collectionSchemaId?: string;
  fieldDef: PropertyDefinition;
  value: string | number | boolean | null;
};

export function InlinePropertyEditor({
  documentId,
  organizationId,
  collectionSchemaId,
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

    if (!collectionSchemaId) {
      setIsEditing(false);
      return;
    }

    await z.mutate(
      mutators.collection.updateFieldValues({
        documentId,
        collectionSchemaId,
        organizationId,
        values: { [fieldDef.name]: finalValue },
      }),
    );

    setIsEditing(false);
  };

  const displayValue = value !== null && value !== undefined ? String(value) : null;

  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="group flex items-start min-h-[28px] rounded-md text-sm transition-colors duration-75 cursor-pointer hover:bg-black/5"
      >
        <div className="flex items-baseline gap-1.5 flex-1 min-w-0 px-2 py-1.5">
          <span className="w-[25%] text-sm font-medium text-gray-900 shrink-0">
            {fieldDef.name}
          </span>
          <span className="flex-1 text-sm text-gray-600 min-w-0">
            {displayValue ?? <span className="text-gray-400 italic">Empty</span>}
          </span>
        </div>
      </div>
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
  onChange,
  onSave,
  onCancel,
}: {
  fieldDef: PropertyDefinition;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if ((fieldDef.type === "select" || fieldDef.type === "multi-select") && fieldDef.options) {
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
          <option key={opt} value={opt}>
            {opt}
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
        fieldDef.type === "number"
          ? "number"
          : fieldDef.type === "date"
            ? "datetime-local"
            : "text"
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
