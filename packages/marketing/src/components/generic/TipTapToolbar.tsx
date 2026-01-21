import React, { useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"
import { Toolbar, Group } from "react-aria-components"
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Undo,
  Redo,
} from "lucide-react"
import { Button } from "./Button"

interface TipTapToolbarProps {
  editor: Editor
}

function ToolbarButton({
  editor,
  onPress,
  icon: Icon,
  title,
  isActive,
  isDisabled,
}: {
  editor: Editor
  onPress: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  isActive?: boolean
  isDisabled?: boolean
}) {
  return (
    <Button
      onPress={onPress}
      intent="ghost"
      size="icon"
      className={`p-1.5 ${isActive ? "bg-gray-200" : ""}`}
      isDisabled={isDisabled}
      aria-label={title}
      title={title}
    >
      <Icon className="w-4 h-4" />
    </Button>
  )
}

export function TipTapToolbar({ editor }: TipTapToolbarProps) {
  const [, forceUpdate] = useState({})

  // Force re-render when editor state changes
  useEffect(() => {
    const update = () => forceUpdate({})
    editor.on("selectionUpdate", update)
    editor.on("update", update)
    editor.on("transaction", update)

    return () => {
      editor.off("selectionUpdate", update)
      editor.off("update", update)
      editor.off("transaction", update)
    }
  }, [editor])

  if (!editor) return null

  return (
    <div className="border-b border-gray-200 bg-gray-50 p-2">
      <Toolbar aria-label="Editor formatting" className="flex items-center gap-1">
        <Group aria-label="History" className="flex gap-1">
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().undo().run()}
            icon={Undo}
            title="Undo"
            isDisabled={!editor.can().undo()}
          />
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().redo().run()}
            icon={Redo}
            title="Redo"
            isDisabled={!editor.can().redo()}
          />
        </Group>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <Group aria-label="Text style" className="flex gap-1">
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleBold().run()}
            icon={Bold}
            title="Bold"
            isActive={editor.isActive("bold")}
          />
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleItalic().run()}
            icon={Italic}
            title="Italic"
            isActive={editor.isActive("italic")}
          />
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleStrike().run()}
            icon={Strikethrough}
            title="Strikethrough"
            isActive={editor.isActive("strike")}
          />
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleCode().run()}
            icon={Code}
            title="Code"
            isActive={editor.isActive("code")}
          />
        </Group>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <Group aria-label="Heading level" className="flex gap-1">
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            icon={Heading1}
            title="Heading 1"
            isActive={editor.isActive("heading", { level: 1 })}
          />
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            icon={Heading2}
            title="Heading 2"
            isActive={editor.isActive("heading", { level: 2 })}
          />
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            icon={Heading3}
            title="Heading 3"
            isActive={editor.isActive("heading", { level: 3 })}
          />
        </Group>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <Group aria-label="Lists" className="flex gap-1">
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleBulletList().run()}
            icon={List}
            title="Bullet List"
            isActive={editor.isActive("bulletList")}
          />
          <ToolbarButton
            editor={editor}
            onPress={() => editor.chain().focus().toggleOrderedList().run()}
            icon={ListOrdered}
            title="Ordered List"
            isActive={editor.isActive("orderedList")}
          />
        </Group>
      </Toolbar>
    </div>
  )
}
