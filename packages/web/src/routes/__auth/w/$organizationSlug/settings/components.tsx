import { AddRegular, DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { Select, SelectItem } from "@lydie/ui/components/generic/Select";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Form } from "react-aria-components";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useAppForm } from "@/hooks/use-app-form";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useZero } from "@/services/zero";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/components")({
  component: RouteComponent,
});

type PropertyField = {
  key: string;
  type: "string" | "number" | "boolean" | "array";
  fields?: ArrayField[];
};

type ArrayField = {
  name: string;
  type: "string" | "number" | "boolean";
};

function RouteComponent() {
  useDocumentTitle("Components");

  const z = useZero();
  const { organization } = useOrganization();
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      name: "",
      properties: [] as PropertyField[],
    },
    onSubmit: async ({ value }: { value: { name: string; properties: PropertyField[] } }) => {
      // Build properties object from array
      const properties: Record<string, { type: string; fields?: ArrayField[] }> = {};

      for (const prop of value.properties) {
        if (prop.key.trim()) {
          properties[prop.key.trim()] = {
            type: prop.type,
            ...(prop.type === "array" && prop.fields?.length ? { fields: prop.fields } : {}),
          };
        }
      }

      if (editingId) {
        // Update existing component
        z.mutate(
          mutators.documentComponent.update({
            id: editingId,
            name: value.name.trim(),
            organizationId: organization.id,
            properties,
          }),
        );
        toast.success("Component updated successfully");
        setEditingId(null);
      } else {
        // Create new component
        const id = createId();
        z.mutate(
          mutators.documentComponent.create({
            id,
            name: value.name.trim(),
            organizationId: organization.id,
            properties,
          }),
        );
        toast.success("Component created successfully");
      }

      // Reset form
      form.reset();
    },
  });

  const [components] = useQuery(
    queries.components.byOrganization({
      organizationId: organization.id,
    }),
  );

  const addProperty = () => {
    const currentProps = form.getFieldValue("properties") || [];
    form.setFieldValue("properties", [...currentProps, { key: "", type: "string" }]);
  };

  const handleEdit = (component: any) => {
    setEditingId(component.id);
    form.setFieldValue("name", component.name);

    // Convert properties object back to array format
    const propertiesRecord = component.properties as Record<
      string,
      { type: string; fields?: ArrayField[] }
    >;
    const propertiesArray: PropertyField[] = Object.entries(propertiesRecord).map(
      ([key, config]) => ({
        key,
        type: config.type as PropertyField["type"],
        fields: config.fields,
      }),
    );
    form.setFieldValue("properties", propertiesArray);
  };

  const handleDelete = (componentId: string) => {
    if (confirm("Are you sure you want to delete this component?")) {
      z.mutate(
        mutators.documentComponent.delete({
          id: componentId,
          organizationId: organization.id,
        }),
      );
      toast.success("Component deleted successfully");

      // If we were editing this component, reset the form
      if (editingId === componentId) {
        setEditingId(null);
        form.reset();
      }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    form.reset();
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Components</Heading>
      </div>
      <Separator />

      <div className="space-y-8">
        {/* Create/Edit Component Form */}
        <div className="space-y-4">
          <div className="flex flex-col gap-y-2">
            <h2 className="text-md/none font-medium">
              {editingId ? "Edit Component" : "Create Component"}
            </h2>
            <p className="text-sm/relaxed text-gray-700">
              Create reusable components for your documents. Components can have properties of
              different types including lists of objects.
            </p>
          </div>

          <Form
            onSubmit={async (e) => {
              e.preventDefault();
              await form.handleSubmit();
            }}
            className="space-y-4"
          >
            <form.AppField
              name="name"
              children={(field) => (
                <field.TextField
                  label="Component Name"
                  placeholder="e.g., link-grid, feature-card"
                  description="Use lowercase letters, numbers, and hyphens"
                />
              )}
            />

            {/* Properties Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">Properties</span>
                <Button type="button" onPress={addProperty} intent="secondary" size="sm">
                  <AddRegular className="size-4 mr-1" />
                  Add Property
                </Button>
              </div>

              <form.Field name="properties" mode="array">
                {(field) => (
                  <div className="space-y-3">
                    {field.state.value.length === 0 && (
                      <p className="text-sm text-gray-500 italic">
                        No properties defined yet. Click "Add Property" to start.
                      </p>
                    )}

                    {field.state.value.map((_prop, index) => (
                      <PropertyRow key={index} form={form} field={field} index={index} />
                    ))}
                  </div>
                )}
              </form.Field>
            </div>

            <div className="flex gap-2">
              <Button type="submit" intent="primary">
                {editingId ? "Update Component" : "Create Component"}
              </Button>
              {editingId && (
                <Button type="button" onPress={handleCancel} intent="secondary">
                  Cancel
                </Button>
              )}
            </div>
          </Form>
        </div>

        <Separator />

        {/* Components List */}
        <div className="space-y-4">
          <h2 className="text-md/none font-medium">Your Components</h2>

          {components.length === 0 ? (
            <p className="text-sm text-gray-500">
              No components created yet. Create your first component above.
            </p>
          ) : (
            <div className="grid gap-3">
              {components.map((component) => (
                <div key={component.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">{component.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {Object.keys(component.properties as Record<string, unknown>).length}{" "}
                        properties
                      </span>
                      <Button
                        type="button"
                        onPress={() => handleEdit(component)}
                        intent="ghost"
                        size="icon-sm"
                        aria-label="Edit component"
                      >
                        <EditRegular className="size-4 text-gray-400 hover:text-blue-500" />
                      </Button>
                      <Button
                        type="button"
                        onPress={() => handleDelete(component.id)}
                        intent="ghost"
                        size="icon-sm"
                        aria-label="Delete component"
                      >
                        <DeleteRegular className="size-4 text-gray-400 hover:text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {Object.keys(component.properties as Record<string, unknown>).length > 0 && (
                    <div className="mt-3 space-y-1">
                      {Object.entries(
                        component.properties as Record<
                          string,
                          { type: string; fields?: ArrayField[] }
                        >,
                      ).map(([key, config]) => (
                        <div key={key} className="text-sm text-gray-600 flex items-center gap-2">
                          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{key}</code>
                          <span className="text-gray-400">→</span>
                          <span className="text-xs text-gray-500">{config.type}</span>
                          {config.type === "array" && config.fields && (
                            <span className="text-xs text-gray-400">
                              (object with {config.fields.length} fields)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Property Row Component
function PropertyRow({ form, field, index }: { form: any; field: any; index: number }) {
  const updatePropertyAtIndex = (updates: Partial<PropertyField>) => {
    const currentProps = form.getFieldValue("properties") as PropertyField[];
    const newProps = [...currentProps];
    newProps[index] = { ...newProps[index], ...updates };
    form.setFieldValue("properties", newProps);
  };

  const updateType = (newType: PropertyField["type"]) => {
    const updates: Partial<PropertyField> = { type: newType };
    if (newType === "array") {
      updates.fields = [{ name: "", type: "string" }];
    }
    updatePropertyAtIndex(updates);
  };

  const removeThisProperty = () => {
    field.removeValue(index);
  };

  const addArrayField = (currentProp: PropertyField) => {
    const currentFields = currentProp.fields || [];
    updatePropertyAtIndex({
      fields: [...currentFields, { name: "", type: "string" }],
    });
  };

  const updateArrayField = (
    currentProp: PropertyField,
    fieldIndex: number,
    updates: Partial<ArrayField>,
  ) => {
    if (currentProp.fields) {
      const newFields = currentProp.fields.map((f: ArrayField, i: number) =>
        i === fieldIndex ? { ...f, ...updates } : f,
      );
      updatePropertyAtIndex({ fields: newFields });
    }
  };

  const removeArrayField = (currentProp: PropertyField, fieldIndex: number) => {
    if (currentProp.fields) {
      const newFields = currentProp.fields.filter((_f: ArrayField, i: number) => i !== fieldIndex);
      updatePropertyAtIndex({ fields: newFields });
    }
  };

  return (
    <form.Subscribe
      selector={(state: any) => state.values.properties[index]}
      children={(prop: PropertyField) => (
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 space-y-3">
          <div className="flex items-start gap-3">
            {/* Property Key */}
            <form.Field name={`properties[${index}].key`}>
              {(keyField: any) => (
                <div className="flex-1">
                  <label
                    htmlFor={`property-key-${index}`}
                    className="text-xs font-medium text-gray-600 mb-1 block"
                  >
                    Property Name
                  </label>
                  <input
                    id={`property-key-${index}`}
                    type="text"
                    placeholder="e.g., title, items, links"
                    value={keyField.state.value}
                    onChange={(e) => keyField.handleChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  />
                </div>
              )}
            </form.Field>

            {/* Property Type */}
            <div>
              <span className="text-xs font-medium text-gray-600 mb-1 block">Type</span>
              <Select<{ id: string; label: string }>
                selectedKey={prop.type}
                onSelectionChange={(key) => updateType(key as PropertyField["type"])}
                aria-label="Property type"
                items={[
                  { id: "string", label: "Text" },
                  { id: "number", label: "Number" },
                  { id: "boolean", label: "Boolean" },
                  { id: "array", label: "List of Objects" },
                ]}
              >
                {(item) => (
                  <SelectItem id={item.id} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>
            </div>

            {/* Remove Button */}
            <Button
              type="button"
              onPress={removeThisProperty}
              intent="ghost"
              size="icon-sm"
              className="mt-5"
              aria-label="Remove property"
            >
              <DeleteRegular className="size-4 text-gray-400 hover:text-red-500" />
            </Button>
          </div>

          {/* Array Fields Configuration */}
          {prop.type === "array" && (
            <div className="border-t border-gray-200 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Object Fields</span>
                <Button
                  type="button"
                  onPress={() => addArrayField(prop)}
                  intent="secondary"
                  size="xs"
                >
                  <AddRegular className="size-3 mr-1" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-2">
                {prop.fields?.map((arrayField, fieldIndex) => (
                  <div key={fieldIndex} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Field name (e.g., title, href)"
                      value={arrayField.name}
                      onChange={(e) => updateArrayField(prop, fieldIndex, { name: e.target.value })}
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    />

                    <select
                      value={arrayField.type}
                      onChange={(e) =>
                        updateArrayField(prop, fieldIndex, {
                          type: e.target.value as ArrayField["type"],
                        })
                      }
                      className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    >
                      <option value="string">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                    </select>

                    <Button
                      type="button"
                      onPress={() => removeArrayField(prop, fieldIndex)}
                      intent="ghost"
                      size="icon-xs"
                      aria-label="Remove field"
                    >
                      <DeleteRegular className="size-3 text-gray-400 hover:text-red-500" />
                    </Button>
                  </div>
                ))}

                {(!prop.fields || prop.fields.length === 0) && (
                  <p className="text-xs text-gray-500 italic">
                    No fields defined. Add at least one field to the object.
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500">
                Example: For a link grid, you might add fields like "title", "href", and "icon".
              </p>
            </div>
          )}
        </div>
      )}
    />
  );
}
