import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Input, Label } from "@lydie/ui/components/generic/Field";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useState } from "react";
import { NumberField as AriaNumberField, TextField as AriaTextField } from "react-aria-components";

type ObjectArrayField = {
  name: string;
  type: string;
};

type ObjectArraySchema = {
  fields: ObjectArrayField[];
};

export function DocumentComponent({ node, updateAttributes }: NodeViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const properties = node.attrs?.properties ?? {};
  const schemas = (node.attrs?.schemas ?? {}) as Record<string, ObjectArraySchema>;
  const propertyEntries = Object.entries(properties);
  const itemCount = propertyEntries.reduce((count, [, value]) => {
    return count + (Array.isArray(value) ? value.length : 0);
  }, 0);

  const updateObjectArrayItem = (key: string, index: number, fieldName: string, value: any) => {
    const currentArray = [...(properties[key] || [])];
    currentArray[index] = {
      ...currentArray[index],
      [fieldName]: value,
    };
    updateAttributes({
      properties: { ...properties, [key]: currentArray },
    });
  };

  const addObjectArrayItem = (key: string, schema: ObjectArraySchema) => {
    const currentArray = [...(properties[key] || [])];
    const newItem = schema.fields.reduce(
      (acc, field) => {
        acc[field.name] = field.type === "number" ? 0 : field.type === "boolean" ? false : "";
        return acc;
      },
      {} as Record<string, any>,
    );

    currentArray.push(newItem);
    updateAttributes({
      properties: { ...properties, [key]: currentArray },
    });
  };

  const removeObjectArrayItem = (key: string, index: number) => {
    const currentArray = [...(properties[key] || [])];
    currentArray.splice(index, 1);
    updateAttributes({
      properties: { ...properties, [key]: currentArray },
    });
  };

  return (
    <NodeViewWrapper className="my-2">
      <div className="overflow-hidden rounded-lg bg-white shadow-surface">
        <div className="flex items-center justify-between border-b border-gray-200 p-2">
          <div className="min-w-0">
            <h3 className="truncate text-xs font-semibold text-gray-900">{node.attrs?.name}</h3>
            <p className="text-[10px] text-gray-500">
              {propertyEntries.length} fields{itemCount > 0 ? ` • ${itemCount} items` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
            className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-600 hover:border-gray-300 hover:text-gray-900"
          >
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
        {!isCollapsed ? (
          <div className="space-y-3 p-2">
            {propertyEntries.map(([key, value]) => {
              const schema = schemas[key];
              const isObjectArray = Array.isArray(value) && schema?.fields;

              if (!isObjectArray) {
                return (
                  <AriaTextField
                    key={key}
                    value={value as string}
                    onChange={(val) =>
                      updateAttributes({
                        properties: { ...properties, [key]: val },
                      })
                    }
                    className="flex flex-col gap-1"
                  >
                    <Label
                      className="truncate text-[10px] font-medium uppercase tracking-wide text-gray-500"
                      title={key}
                    >
                      {key}
                    </Label>
                    <Input placeholder={`Enter ${key}...`} />
                  </AriaTextField>
                );
              }

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      {key}
                    </label>
                    <span className="rounded-full bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400">
                      {(value as any[]).length} items
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {(value as any[]).map((item: any, index: number) => (
                      <div
                        key={index}
                        className="group relative rounded-md border border-gray-200 bg-gray-50/30 p-2 hover:border-gray-300 hover:bg-gray-50"
                      >
                        <button
                          type="button"
                          onClick={() => removeObjectArrayItem(key, index)}
                          className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 opacity-0 shadow-sm transition-all hover:border-red-200 hover:text-red-500 group-hover:opacity-100"
                          title="Remove item"
                        >
                          <DeleteRegular className="size-3" />
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          {schema.fields.map((field) => (
                            <div key={field.name} className="space-y-1">
                              {field.type === "boolean" ? (
                                <div className="flex flex-col gap-1">
                                  <Label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                    {field.name}
                                  </Label>
                                  <div className="flex h-8 items-center">
                                    <input
                                      type="checkbox"
                                      checked={item[field.name]}
                                      onChange={(e) =>
                                        updateObjectArrayItem(
                                          key,
                                          index,
                                          field.name,
                                          e.target.checked,
                                        )
                                      }
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                              ) : field.type === "number" ? (
                                <AriaNumberField
                                  value={item[field.name]}
                                  onChange={(val) =>
                                    updateObjectArrayItem(key, index, field.name, val)
                                  }
                                  className="flex flex-col gap-1"
                                >
                                  <Label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                    {field.name}
                                  </Label>
                                  <Input />
                                </AriaNumberField>
                              ) : (
                                <AriaTextField
                                  value={item[field.name]}
                                  onChange={(val) =>
                                    updateObjectArrayItem(key, index, field.name, val)
                                  }
                                >
                                  <Label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                    {field.name}
                                  </Label>
                                  <Input />
                                </AriaTextField>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    onPress={() => addObjectArrayItem(key, schema)}
                    intent="secondary"
                    size="xs"
                    className="w-full justify-center border-dashed py-1"
                  >
                    <AddRegular className="mr-1.5 size-3" />
                    Add Item
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
