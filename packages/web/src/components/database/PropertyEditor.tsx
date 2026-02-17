import type { FieldDefinition } from "@lydie/core/database";
import { useState } from "react";

type Props = {
  schema: FieldDefinition[];
  properties: Record<string, string | number | boolean | null>;
  onUpdate: (field: string, value: string | number | boolean | null) => void;
};

export function PropertyEditor({ schema, properties, onUpdate }: Props) {
  return (
    <div className="space-y-3">
      {schema.map((field) => (
        <PropertyField
          key={field.field}
          field={field}
          value={properties[field.field]}
          onChange={(value) => onUpdate(field.field, value)}
        />
      ))}
    </div>
  );
}

function PropertyField({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: string | number | boolean | null | undefined;
  onChange: (value: string | number | boolean | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = (newValue: string | number | boolean | null) => {
    onChange(newValue);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div onClick={() => setIsEditing(true)} className="group cursor-pointer">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          {field.field}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <div className="px-3 py-2 bg-white border border-gray-200 rounded text-sm hover:border-gray-300 transition-colors">
          {value !== null && value !== undefined ? (
            <span>{String(value)}</span>
          ) : (
            <span className="text-gray-400 italic">Empty</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {field.field}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <FieldInput
        field={field}
        value={value}
        onSave={handleSave}
        onCancel={() => setIsEditing(false)}
      />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onSave,
  onCancel,
}: {
  field: FieldDefinition;
  value: string | number | boolean | null | undefined;
  onSave: (value: string | number | boolean | null) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState<string>(
    value !== null && value !== undefined ? String(value) : "",
  );

  const handleSave = () => {
    let finalValue: string | number | boolean | null = editValue;

    if (field.type === "boolean") {
      finalValue = editValue === "true" || editValue === "on";
    } else if (field.type === "number") {
      finalValue = editValue ? Number(editValue) : null;
    } else if (editValue === "") {
      finalValue = null;
    }

    onSave(finalValue);
  };

  if (field.type === "select" && field.options) {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => {
          onSave(e.target.value || null);
        }}
        onBlur={handleSave}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      >
        <option value="">—</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(e) => onSave(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300"
          autoFocus
        />
        <span className="text-sm text-gray-600">{field.field}</span>
      </div>
    );
  }

  return (
    <input
      type={
        field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"
      }
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") onCancel();
      }}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      autoFocus
    />
  );
}
