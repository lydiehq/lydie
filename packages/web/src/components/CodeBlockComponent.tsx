import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import {
  Button,
  Popover,
  Select,
  SelectValue,
  Autocomplete,
  SearchField,
  Label,
  useFilter,
} from "react-aria-components"
import { ChevronDownRegular } from "@fluentui/react-icons"
import { useMemo, useState, useEffect, useCallback, type Key } from "react"
import { ListBox, ListBoxItem } from "./generic/ListBox"

type LanguageItem = {
  id: string
  name: string
}

function LanguageSelect({
  selectedKey,
  onSelectionChange,
  items,
}: {
  selectedKey: string | null
  onSelectionChange: (value: Key | null) => void
  items: LanguageItem[]
}) {
  let { contains } = useFilter({ sensitivity: "base" })

  return (
    <Select onChange={onSelectionChange} value={selectedKey} className="absolute top-3 right-3">
      <Label className="sr-only">Category</Label>
      <Button className="group-hover:opacity-100 opacity-100 transition-opacity duration-200 flex items-center gap-x-1.5">
        <SelectValue className="font-medium text-gray-700 text-sm" />
        <ChevronDownRegular className="size-4 text-gray-500" />
      </Button>
      <Popover style={{ display: "flex", flexDirection: "column" }}>
        <Autocomplete filter={contains}>
          <SearchField aria-label="Search tags" autoFocus style={{ margin: 4 }} />
          <ListBox items={items}>{(item) => <ListBoxItem id={item.name}>{item.name}</ListBoxItem>}</ListBox>
        </Autocomplete>
      </Popover>
    </Select>
  )
}

export function CodeBlockComponent({ node, updateAttributes, editor }: NodeViewProps) {
  const defaultLanguage = node.attrs?.language || "null"

  // Memoize lowlight lookup - editor instance is stable, so this only runs once
  const lowlight = useMemo(() => {
    const codeBlockExtension = editor.extensionManager.extensions.find((ext) => ext.name === "codeBlock")
    return codeBlockExtension?.options.lowlight
  }, [editor])

  // Prepare items for the ComboBox
  const items = useMemo(() => {
    const languages = lowlight?.listLanguages() || []
    return [{ id: "null", name: "auto" }, ...languages.map((lang: string) => ({ id: lang, name: lang }))]
  }, [lowlight])

  const [selectedKey, setSelectedKey] = useState<string | null>(defaultLanguage)

  // Sync selectedKey with node attributes when they change externally
  useEffect(() => {
    const currentLanguage = node.attrs?.language || "null"
    if (currentLanguage !== selectedKey) {
      setSelectedKey(currentLanguage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.attrs?.language])

  const handleSelectionChange = useCallback(
    (key: Key | null) => {
      const keyString = key === null ? null : String(key)
      setSelectedKey(keyString)
      updateAttributes({ language: keyString === "null" ? null : keyString })
    },
    [updateAttributes],
  )

  return (
    <NodeViewWrapper className="relative group">
      <div className="flex relative overflow-x-auto rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 my-0">
        <pre className="">
          <code className="">
            <NodeViewContent />
          </code>
        </pre>
        <LanguageSelect selectedKey={selectedKey} onSelectionChange={handleSelectionChange} items={items} />
      </div>
    </NodeViewWrapper>
  )
}
