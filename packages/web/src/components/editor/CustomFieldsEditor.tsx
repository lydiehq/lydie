import { CalendarRegular, DismissRegular, NumberSymbolRegular } from "@fluentui/react-icons";
import { mutators } from "@lydie/zero/mutators";
import { useMemo, useState } from "react";
import { MenuTrigger } from "react-aria-components";
import { useDebounceCallback } from "usehooks-ts";

import { Menu, MenuItem } from "@/components/generic/Menu";
import { useAppForm } from "@/hooks/use-app-form";
import { useZero } from "@/services/zero";

import { DocumentIcon } from "./icons/DocumentIcon";

type CustomField = {
  key: string;
  value: string | number;
  type: "string" | "number" | "date";
};

type Props = {
  documentId: string;
  organizationId: string;
  initialFields?: Record<string, string | number>;
};

export function CustomFieldsEditor({ documentId, organizationId, initialFields = {} }: Props) {
  const z = useZero();

  // Convert initial fields to array format
  const initialFieldsArray = useMemo(() => {
    return Object.entries(initialFields).map(([key, value]) => ({
      key,
      value,
      type: typeof value === "number" ? ("number" as const) : ("string" as const),
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
          Object.keys(customFields).length > 0 ? (customFields as Record<string, string>) : {},
        organizationId,
      }),
    );
  }, 500);

  const handleFieldChange = () => {
    const fields = form.getFieldValue("fields") || [];
    debouncedSave(fields);
  };

  const getTypeIcon = (type: "string" | "number" | "date") => {
    switch (type) {
      case "string":
        return DocumentIcon;
      case "number":
        return NumberSymbolRegular;
      case "date":
        return CalendarRegular;
      default:
        return DocumentIcon;
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col">
        <form.Field name="fields" mode="array">
          {(field) => (
            <div className="flex flex-col gap-0.5">
              {field.state.value.map((_, i) => {
                const fieldType = field.state.value[i]?.type || "string";
                return (
                  <CustomFieldRow
                    key={i}
                    form={form}
                    field={field}
                    index={i}
                    fieldType={fieldType}
                    handleFieldChange={handleFieldChange}
                    getTypeIcon={getTypeIcon}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => {
                  field.pushValue({ key: "", value: "", type: "string" });
                }}
                className="text-sm text-gray-600 hover:text-gray-900 px-0 py-1.5 rounded-md hover:bg-transparent transition-colors self-start mt-1"
              >
                + Add property
              </button>
            </div>
          )}
        </form.Field>
      </div>
    </form>
  );
}

type CustomFieldRowProps = {
  form: any;
  field: any;
  index: number;
  fieldType: "string" | "number" | "date";
  handleFieldChange: () => void;
  getTypeIcon: (type: "string" | "number" | "date") => React.ComponentType<{ className?: string }>;
};

function CustomFieldRow({
  form,
  field,
  index,
  fieldType,
  handleFieldChange,
  getTypeIcon,
}: CustomFieldRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const TypeIcon = getTypeIcon(fieldType);

  return (
    <div className="group flex items-center h-[28px] rounded-md text-sm font-medium transition-colors duration-75 px-1.5 hover:bg-black/5">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {/* Type picker button with icon */}
        <MenuTrigger isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-700 p-1 -ml-0.5 group/type-picker relative size-5 rounded-md hover:bg-black/5 flex items-center justify-center"
            aria-label="Change property type"
          >
            <TypeIcon className="size-4 shrink-0 text-gray-500" />
          </button>
          <Menu>
            <MenuItem
              onAction={() => {
                field.updateValue(index, { ...field.state.value[index], type: "string" });
                handleFieldChange();
              }}
            >
              <div className="flex items-center gap-2">
                <DocumentIcon className="size-4" />
                <span>Text</span>
              </div>
            </MenuItem>
            <MenuItem
              onAction={() => {
                field.updateValue(index, { ...field.state.value[index], type: "number" });
                handleFieldChange();
              }}
            >
              <div className="flex items-center gap-2">
                <NumberSymbolRegular className="size-4" />
                <span>Number</span>
              </div>
            </MenuItem>
            <MenuItem
              onAction={() => {
                field.updateValue(index, { ...field.state.value[index], type: "date" });
                handleFieldChange();
              }}
            >
              <div className="flex items-center gap-2">
                <CalendarRegular className="size-4" />
                <span>Date</span>
              </div>
            </MenuItem>
          </Menu>
        </MenuTrigger>

        {/* Property name input */}
        <form.Field name={`fields[${index}].key`}>
          {(keyField: any) => (
            <input
              type="text"
              placeholder="Property name"
              value={keyField.state.value}
              onChange={(e) => {
                keyField.handleChange(e.target.value);
                handleFieldChange();
              }}
              onBlur={handleFieldChange}
              className="w-[25%] text-sm font-medium text-gray-900 bg-transparent border-none outline-none focus:outline-none px-0 py-0 shrink-0"
            />
          )}
        </form.Field>

        {/* Value input - fills the rest */}
        <form.Field name={`fields[${index}].value`}>
          {(valueField: any) => (
            <input
              type="text"
              placeholder="Value"
              value={String(valueField.state.value || "")}
              onChange={(e) => {
                const newValue =
                  fieldType === "number" ? Number(e.target.value) || 0 : e.target.value;
                valueField.handleChange(newValue);
                handleFieldChange();
              }}
              onBlur={handleFieldChange}
              className="flex-1 text-sm text-gray-600 bg-transparent border-none outline-none focus:outline-none px-0 py-0 min-w-0"
            />
          )}
        </form.Field>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => {
          field.removeValue(index);
          handleFieldChange();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-black/5 transition-all shrink-0 -mr-1"
        aria-label="Remove property"
      >
        <DismissRegular className="w-4 h-4" />
      </button>
    </div>
  );
}
