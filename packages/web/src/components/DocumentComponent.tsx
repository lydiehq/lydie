import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { AddIcon, Trash2Icon } from "@/icons"
import { Button } from "./generic/Button"
import { TextField as AriaTextField, NumberField as AriaNumberField } from "react-aria-components"
import { Input, Label } from "./generic/Field"

type ObjectArrayField = {
  name: string
  type: string
}

type ObjectArraySchema = {
  fields: ObjectArrayField[]
}

export function DocumentComponent({ node, updateAttributes }: NodeViewProps) {
  const properties = node.attrs?.properties ?? {}
  const schemas = (node.attrs?.schemas ?? {}) as Record<string, ObjectArraySchema>

  const updateObjectArrayItem = (key: string, index: number, fieldName: string, value: any) => {
    const currentArray = [...(properties[key] || [])]
    currentArray[index] = {
      ...currentArray[index],
      [fieldName]: value,
    }
    updateAttributes({
      properties: { ...properties, [key]: currentArray },
    })
  }

  const addObjectArrayItem = (key: string, schema: ObjectArraySchema) => {
    const currentArray = [...(properties[key] || [])]
    const newItem = schema.fields.reduce(
      (acc, field) => {
        acc[field.name] = field.type === "number" ? 0 : field.type === "boolean" ? false : ""
        return acc
      },
      {} as Record<string, any>,
    )

    currentArray.push(newItem)
    updateAttributes({
      properties: { ...properties, [key]: currentArray },
    })
  }

  const removeObjectArrayItem = (key: string, index: number) => {
    const currentArray = [...(properties[key] || [])]
    currentArray.splice(index, 1)
    updateAttributes({
      properties: { ...properties, [key]: currentArray },
    })
  }

  return (
    <NodeViewWrapper className="my-4">
      <div className="rounded-xl bg-white shadow-surface overflow-hidden">
        <div className="p-2 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">{node.attrs?.name}</h3>
        </div>
        <div className="p-3 space-y-4">
          {Object.entries(properties).map(([key, value]) => {
            const schema = schemas[key]
            const isObjectArray = Array.isArray(value) && schema?.fields

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
                  <Label className="text-xs font-medium text-gray-500 truncate" title={key}>
                    {key}
                  </Label>
                  <Input placeholder={`Enter ${key}...`} />
                </AriaTextField>
              )
            }

            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{key}</label>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                    {(value as any[]).length} items
                  </span>
                </div>

                <div className="space-y-2">
                  {(value as any[]).map((item: any, index: number) => (
                    <div
                      key={index}
                      className="group relative border border-gray-200 rounded-md p-2.5 bg-gray-50/30 hover:bg-gray-50 hover:border-gray-300 transition-all"
                    >
                      <button
                        onClick={() => removeObjectArrayItem(key, index)}
                        className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-red-500 hover:border-red-200 opacity-0 group-hover:opacity-100 transition-all z-10"
                        title="Remove item"
                      >
                        <Trash2Icon className="size-3" />
                      </button>

                      <div className="grid grid-cols-2 gap-3">
                        {schema.fields.map((field) => (
                          <div key={field.name} className="space-y-1">
                            {field.type === "boolean" ? (
                              <div className="flex flex-col gap-1">
                                <Label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                  {field.name}
                                </Label>
                                <div className="flex items-center h-8">
                                  <input
                                    type="checkbox"
                                    checked={item[field.name]}
                                    onChange={(e) =>
                                      updateObjectArrayItem(key, index, field.name, e.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                            ) : field.type === "number" ? (
                              <AriaNumberField
                                value={item[field.name]}
                                onChange={(val) => updateObjectArrayItem(key, index, field.name, val)}
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
                                onChange={(val) => updateObjectArrayItem(key, index, field.name, val)}
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
                  className="w-full justify-center border-dashed"
                >
                  <AddIcon className="size-3 mr-1.5" />
                  Add Item
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
