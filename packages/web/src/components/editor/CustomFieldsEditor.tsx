import { useAppForm } from "@/hooks/use-app-form";
import { useZero } from "@/services/zero";
import { mutators } from "@lydie/zero/mutators";
import { useDebounceCallback } from "usehooks-ts";
import { useMemo, useEffect } from "react";
import { X } from "lucide-react";

type CustomField = {
  key: string;
  value: string | number;
  type: "string" | "number";
};

type Props = {
  documentId: string;
  organizationId: string;
  initialFields?: Record<string, string | number>;
};

export function CustomFieldsEditor({
  documentId,
  organizationId,
  initialFields = {},
}: Props) {
  const z = useZero();

  // Convert initial fields to array format
  const initialFieldsArray = useMemo(() => {
    return Object.entries(initialFields).map(([key, value]) => ({
      key,
      value,
      type:
        typeof value === "number" ? ("number" as const) : ("string" as const),
    }));
  }, [initialFields]);

  const form = useAppForm({
    defaultValues: {
      fields: initialFieldsArray,
    },
  });

  // Debounced save function
  const debouncedSave = useDebounceCallback((fields: CustomField[]) => {
    // Convert array back to object, filtering out empty keys
    const customFields: Record<string, string | number> = {};
    for (const field of fields) {
      if (
        field.key.trim() &&
        field.value !== "" &&
        field.value !== null &&
        field.value !== undefined
      ) {
        customFields[field.key.trim()] = field.value;
      }
    }

    // Only save if there are fields, otherwise set to empty object
    z.mutate(
      mutators.document.update({
        documentId,
        customFields:
          Object.keys(customFields).length > 0
            ? (customFields as Record<string, string>)
            : {},
        organizationId,
      })
    );
  }, 500);

  const handleFieldChange = () => {
    const fields = form.getFieldValue("fields") || [];
    debouncedSave(fields);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.Field name="fields" mode="array">
        {(field) => (
          <div className="space-y-2">
            {field.state.value.map((_, i) => (
              <div key={i} className="flex gap-2 items-start">
                <form.Field name={`fields[${i}].key`}>
                  {(keyField) => (
                    <input
                      type="text"
                      placeholder="Field name"
                      value={keyField.state.value}
                      onChange={(e) => {
                        keyField.handleChange(e.target.value);
                        handleFieldChange();
                      }}
                      onBlur={handleFieldChange}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}
                </form.Field>
                <form.Field name={`fields[${i}].type`}>
                  {(typeField) => (
                    <select
                      value={typeField.state.value}
                      onChange={(e) => {
                        const newType = e.target.value as "string" | "number";
                        typeField.handleChange(newType);
                        // Convert value type if needed
                        const currentField = field.state.value[i];
                        const newValue =
                          newType === "number"
                            ? typeof currentField.value === "number"
                              ? currentField.value
                              : Number(currentField.value) || 0
                            : String(currentField.value);
                        // Update value field
                        form.setFieldValue(`fields[${i}].value`, newValue);
                        handleFieldChange();
                      }}
                      className="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                    </select>
                  )}
                </form.Field>
                <form.Field name={`fields[${i}].value`}>
                  {(valueField) => (
                    <input
                      type={
                        field.state.value[i]?.type === "number"
                          ? "number"
                          : "text"
                      }
                      placeholder="Value"
                      value={valueField.state.value}
                      onChange={(e) => {
                        const newValue =
                          field.state.value[i]?.type === "number"
                            ? Number(e.target.value) || 0
                            : e.target.value;
                        valueField.handleChange(newValue);
                        handleFieldChange();
                      }}
                      onBlur={handleFieldChange}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}
                </form.Field>
                <button
                  type="button"
                  onClick={() => {
                    field.removeValue(i);
                    handleFieldChange();
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                  aria-label="Remove field"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                field.pushValue({ key: "", value: "", type: "string" });
              }}
              className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              + Add field
            </button>
          </div>
        )}
      </form.Field>
    </form>
  );
}
