import type { FieldDefinition } from "@lydie/core/database";
import { mutators } from "@lydie/zero/mutators";
import { useState } from "react";

import { useZero } from "@/services/zero";

type Props = {
  documentId: string;
  organizationId: string;
  schema: FieldDefinition[];
  properties: Record<string, string | number | boolean | null>;
};

export function FieldPanel({ documentId, organizationId, schema, properties }: Props) {
  const z = useZero();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const handleSave = async (field: string, value: string | number | boolean | null) => {
    await z.mutate(
      mutators.document.updateProperties({
        documentId,
        organizationId,
        properties: { [field]: value },
      }),
    );
    setEditingField(null);
  };

  const startEditing = (fieldDef: FieldDefinition, currentValue: unknown) => {
    setEditingField(fieldDef.field);
    setEditValue(String(currentValue ?? ""));
  };

  return (
    <div className="w-72 shrink-0 border-l border-gray-200 bg-gray-50/50 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Properties</h3>
      <div className="space-y-4">
        {schema.map((fieldDef) => {
          const value = properties[fieldDef.field];
          const isEditing = editingField === fieldDef.field;

          return (
            <div key={fieldDef.field} className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">
                {fieldDef.field}
                {fieldDef.required && <span className="ml-1 text-red-500">*</span>}
              </label>
              {isEditing ? (
                <FieldInput
                  fieldDef={fieldDef}
                  value={editValue}
                  onChange={setEditValue}
                  onSave={(val) => handleSave(fieldDef.field, val)}
                  onCancel={() => setEditingField(null)}
                />
              ) : (
                <div
                  onClick={() => startEditing(fieldDef, value)}
                  className="cursor-pointer rounded border border-transparent bg-white px-3 py-2 text-sm text-gray-900 hover:border-gray-300"
                >
                  {value ? String(value) : <span className="text-gray-400">-</span>}
                </div>
              )}
            </div>
          );
        })}
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
  fieldDef: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string | number | boolean | null) => void;
  onCancel: () => void;
}) {
  const handleSave = () => {
    let finalValue: string | number | boolean | null = value;

    if (fieldDef.type === "boolean") {
      finalValue = value === "true" || value === "on";
    }

    onSave(finalValue);
  };

  if (fieldDef.type === "select" && fieldDef.options) {
    return (
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        onBlur={handleSave}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
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

  if (fieldDef.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === "true" || value === "on"}
        onChange={(e) => onSave(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
        autoFocus
      />
    );
  }

  return (
    <input
      type={fieldDef.type === "datetime" ? "datetime-local" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") onCancel();
      }}
      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      autoFocus
    />
  );
}
