import { Add12Filled, Delete12Filled } from "@fluentui/react-icons";
import type { FieldDefinition } from "@lydie/core/database";
import { Button } from "@lydie/ui/components/generic/Button";
import { useState } from "react";

type Props = {
  schema: FieldDefinition[];
  onChange: (schema: FieldDefinition[]) => void;
  readOnly?: boolean;
};

const FIELD_TYPES: { value: FieldDefinition["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "boolean", label: "Checkbox" },
  { value: "datetime", label: "Date & Time" },
  { value: "file", label: "File" },
];

export function PropertyConfig({ schema, onChange, readOnly }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [newField, setNewField] = useState<Partial<FieldDefinition>>({
    type: "text",
    required: false,
  });
  const [optionsInput, setOptionsInput] = useState("");

  const handleAdd = () => {
    if (!newField.field || !newField.type) return;

    const fieldDef: FieldDefinition = {
      field: newField.field,
      type: newField.type,
      required: newField.required || false,
      options:
        newField.type === "select" && optionsInput
          ? optionsInput
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
    };

    onChange([...schema, fieldDef]);
    setIsAdding(false);
    setNewField({ type: "text", required: false });
    setOptionsInput("");
  };

  const handleRemove = (index: number) => {
    onChange(schema.filter((_, i) => i !== index));
  };

  if (readOnly) {
    return (
      <div className="space-y-2">
        {schema.map((field) => (
          <div
            key={field.field}
            className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm"
          >
            <span className="font-medium">{field.field}</span>
            <span className="text-gray-500 text-xs">
              {FIELD_TYPES.find((t) => t.value === field.type)?.label}
              {field.required && " · Required"}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Existing properties */}
      {schema.map((field, index) => (
        <div
          key={field.field}
          className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm group"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{field.field}</span>
            <span className="text-gray-400 text-xs">
              {FIELD_TYPES.find((t) => t.value === field.type)?.label}
              {field.required && " · Required"}
            </span>
          </div>
          <button
            onClick={() => handleRemove(index)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
          >
            <Delete12Filled className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      ))}

      {/* Add new property form */}
      {isAdding ? (
        <div className="space-y-3 p-3 bg-gray-50 rounded">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Property name</label>
            <input
              type="text"
              value={newField.field || ""}
              onChange={(e) => setNewField({ ...newField, field: e.target.value })}
              placeholder="e.g., Status, Priority, Due Date"
              className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              value={newField.type}
              onChange={(e) =>
                setNewField({
                  ...newField,
                  type: e.target.value as FieldDefinition["type"],
                })
              }
              className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FIELD_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {newField.type === "select" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Options (comma-separated)
              </label>
              <input
                type="text"
                value={optionsInput}
                onChange={(e) => setOptionsInput(e.target.value)}
                placeholder="todo, in-progress, done"
                className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="required"
              checked={newField.required || false}
              onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="required" className="text-sm text-gray-600">
              Required field
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleAdd} className="flex-1">
              Add Property
            </Button>
            <Button
              size="sm"
              intent="secondary"
              onClick={() => {
                setIsAdding(false);
                setNewField({ type: "text", required: false });
                setOptionsInput("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded transition-colors"
        >
          <Add12Filled className="w-4 h-4" />
          Add property
        </button>
      )}
    </div>
  );
}
