import { useAppForm } from "@/hooks/use-app-form"
import { useZero } from "@/services/zero"
import { mutators } from "@lydie/zero/mutators"
import { useDebounceCallback } from "usehooks-ts"
import { useMemo } from "react"
import { XIcon, GripVerticalIcon, CalendarIcon, ListIcon } from "@/icons"

type CustomField = {
  key: string
  value: string | number
  type: "string" | "number"
}

type Props = {
  documentId: string
  organizationId: string
  initialFields?: Record<string, string | number>
}

export function CustomFieldsEditor({ documentId, organizationId, initialFields = {} }: Props) {
  const z = useZero()

  // Convert initial fields to array format
  const initialFieldsArray = useMemo(() => {
    return Object.entries(initialFields).map(([key, value]) => ({
      key,
      value,
      type: typeof value === "number" ? ("number" as const) : ("string" as const),
    }))
  }, [initialFields])

  const form = useAppForm({
    defaultValues: {
      fields: initialFieldsArray,
    },
  })

  // Debounced save function
  const debouncedSave = useDebounceCallback((fields: CustomField[]) => {
    // Convert array back to object, filtering out empty keys
    const customFields: Record<string, string | number> = {}
    for (const field of fields) {
      if (field.key.trim() && field.value !== "" && field.value !== null && field.value !== undefined) {
        customFields[field.key.trim()] = field.value
      }
    }

    // Only save if there are fields, otherwise set to empty object
    z.mutate(
      mutators.document.update({
        documentId,
        customFields: Object.keys(customFields).length > 0 ? (customFields as Record<string, string>) : {},
        organizationId,
      }),
    )
  }, 500)

  const handleFieldChange = () => {
    const fields = form.getFieldValue("fields") || []
    debouncedSave(fields)
  }

  const getFieldIcon = (key: string) => {
    const lowerKey = key.toLowerCase()
    if (lowerKey.includes("date") || lowerKey.includes("time")) {
      return CalendarIcon
    }
    if (lowerKey.includes("class") || lowerKey.includes("tag") || lowerKey.includes("category")) {
      return ListIcon
    }
    return GripVerticalIcon
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="flex flex-col">
        <form.Field name="fields" mode="array">
          {(field) => (
            <div className="flex flex-col gap-3">
              {field.state.value.map((_, i) => {
                const Icon = getFieldIcon(field.state.value[i]?.key || "")
                return (
                  <div key={i} className="flex gap-3 items-start group">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                      <form.Field name={`fields[${i}].key`}>
                        {(keyField) => (
                          <div className="flex items-center gap-1 min-w-0 shrink-0">
                            <input
                              type="text"
                              placeholder="Property name"
                              value={keyField.state.value}
                              onChange={(e) => {
                                keyField.handleChange(e.target.value)
                                handleFieldChange()
                              }}
                              onBlur={handleFieldChange}
                              className="text-sm font-medium text-gray-900 bg-transparent border-none outline-none focus:outline-none px-0 py-0 min-w-[80px] shrink-0"
                              style={{
                                width: `${Math.max(80, (keyField.state.value.length || 10) * 8)}px`,
                              }}
                            />
                          </div>
                        )}
                      </form.Field>
                    </div>
                    <div className="flex-1 min-w-0 flex items-start gap-2">
                      <form.Field name={`fields[${i}].value`}>
                        {(valueField) => (
                          <textarea
                            placeholder="Value"
                            value={String(valueField.state.value || "")}
                            onChange={(e) => {
                              const newValue =
                                field.state.value[i]?.type === "number"
                                  ? Number(e.target.value) || 0
                                  : e.target.value
                              valueField.handleChange(newValue)
                              handleFieldChange()
                            }}
                            onBlur={handleFieldChange}
                            rows={1}
                            className="flex-1 text-sm text-gray-700 bg-transparent border-none outline-none focus:outline-none resize-none overflow-y-auto px-0 py-0 min-h-6 max-h-12"
                            style={{
                              height: "auto",
                              minHeight: "1.5rem",
                              maxHeight: "3rem",
                            }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement
                              target.style.height = "auto"
                              const maxHeight = 48 // 3rem = 48px (2 lines)
                              target.style.height = `${Math.min(target.scrollHeight, maxHeight)}px`
                            }}
                          />
                        )}
                      </form.Field>
                      <button
                        type="button"
                        onClick={() => {
                          field.removeValue(i)
                          handleFieldChange()
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-all shrink-0"
                        aria-label="Remove property"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  field.pushValue({ key: "", value: "", type: "string" })
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
  )
}
