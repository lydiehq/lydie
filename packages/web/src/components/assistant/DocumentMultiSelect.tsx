import { useCallback, useMemo, useState } from "react"
import { Button as RACButton, useFilter, Autocomplete, ListBox, DialogTrigger } from "react-aria-components"
import { AddRegular, DocumentFilled } from "@fluentui/react-icons"
import { SearchField } from "@/components/generic/SearchField"
import { Popover } from "@/components/generic/Popover"
import { Button } from "../generic/Button"
import { SelectItem } from "@/components/generic/Select"

interface DocumentMultiSelectProps {
  availableDocuments: Array<{ id: string; title: string }>
  contextDocumentIds: string[]
  onAddDocument: (documentId: string) => void
}

export function DocumentMultiSelect({
  availableDocuments,
  contextDocumentIds,
  onAddDocument,
}: DocumentMultiSelectProps) {
  const { contains } = useFilter({ sensitivity: "base" })
  const [searchText, setSearchText] = useState("")

  // Filter out documents already in context
  const availableToAdd = useMemo(() => {
    return availableDocuments.filter((doc) => !contextDocumentIds.includes(doc.id))
  }, [availableDocuments, contextDocumentIds])

  const filteredDocuments = useMemo(() => {
    if (!searchText) return availableToAdd
    return availableToAdd.filter((doc) => contains(doc.title, searchText))
  }, [availableToAdd, searchText, contains])

  const handleSelectDocument = useCallback(
    (documentId: string) => {
      onAddDocument(documentId)
      setSearchText("")
    },
    [onAddDocument],
  )

  if (availableToAdd.length === 0) return null

  return (
    <DialogTrigger>
      <Button intent="ghost" size="icon-sm" aria-label="Add documents to context" className="shrink-0">
        <AddRegular className="size-3.5 text-gray-500" />
      </Button>
      <Popover className="min-w-[320px] max-h-[500px] flex flex-col p-0" placement="top start">
        <Autocomplete filter={contains}>
          <div className="p-2 border-b border-gray-200">
            <SearchField
              placeholder="Search documents..."
              aria-label="Search documents"
              className="w-full"
              value={searchText}
              onChange={setSearchText}
            />
          </div>
          <ListBox
            items={filteredDocuments}
            className="outline-none max-h-[400px] overflow-auto p-1"
            selectionMode="single"
          >
            {(document: { id: string; title: string }) => (
              <SelectItem id={document.id} textValue={document.title}>
                <RACButton
                  onPress={() => handleSelectDocument(document.id)}
                  className="flex items-center gap-2 w-full text-left outline-none hover:bg-gray-50 rounded px-2 py-1.5"
                >
                  <DocumentFilled className="size-4 text-gray-500 shrink-0" />
                  <span className="text-sm truncate flex-1">{document.title}</span>
                </RACButton>
              </SelectItem>
            )}
          </ListBox>
        </Autocomplete>
        {filteredDocuments.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">
            {searchText ? "No documents found" : "No documents available"}
          </div>
        )}
      </Popover>
    </DialogTrigger>
  )
}
