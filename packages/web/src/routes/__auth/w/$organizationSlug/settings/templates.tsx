import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { useAuth } from "@/context/auth.context"
import { isAdmin } from "@/utils/admin"
import { useZero } from "@/services/zero"
import { mutators } from "@lydie/zero/mutators"
import { Button } from "@/components/generic/Button"
import { Heading } from "@/components/generic/Heading"
import { toast } from "sonner"
import { AddRegular, DeleteRegular, SaveRegular } from "@fluentui/react-icons"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/templates")({
  component: RouteComponent,
})

type TemplateDocument = {
  id: string
  title: string
  content: any
  parentId?: string
  sortOrder: number
}

type Template = {
  name: string
  description: string
  documents: TemplateDocument[]
}

function RouteComponent() {
  const { user } = useAuth()
  const z = useZero()

  if (!isAdmin(user)) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Heading className="text-xl mb-2">Access Denied</Heading>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <Heading className="text-2xl mb-2">Templates</Heading>
        <p className="text-gray-600">Create and manage templates for the marketplace.</p>
      </div>

      <TemplateCreator />
    </div>
  )
}

function TemplateCreator() {
  const z = useZero()
  const [template, setTemplate] = useState<Template>({
    name: "",
    description: "",
    documents: [],
  })
  const [selectedDocIndex, setSelectedDocIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectedDoc = selectedDocIndex !== null ? template.documents[selectedDocIndex] : null

  const editor = useEditor({
    extensions: [StarterKit],
    content: selectedDoc?.content || { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: ({ editor }) => {
      if (selectedDocIndex !== null) {
        const newDocs = [...template.documents]
        newDocs[selectedDocIndex] = {
          ...newDocs[selectedDocIndex],
          content: editor.getJSON(),
        }
        setTemplate({ ...template, documents: newDocs })
      }
    },
  })

  // Update editor content when selected document changes
  useEffect(() => {
    if (editor && selectedDoc) {
      editor.commands.setContent(selectedDoc.content)
    }
  }, [selectedDocIndex, editor])

  const handleAddDocument = () => {
    const newDoc: TemplateDocument = {
      id: `temp-${Date.now()}`,
      title: "Untitled Document",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      sortOrder: template.documents.length,
    }
    setTemplate({
      ...template,
      documents: [...template.documents, newDoc],
    })
    setSelectedDocIndex(template.documents.length)
  }

  const handleRemoveDocument = (index: number) => {
    const newDocs = template.documents.filter((_, i) => i !== index)
    setTemplate({ ...template, documents: newDocs })
    if (selectedDocIndex === index) {
      setSelectedDocIndex(null)
    } else if (selectedDocIndex !== null && selectedDocIndex > index) {
      setSelectedDocIndex(selectedDocIndex - 1)
    }
  }

  const handleUpdateDocTitle = (index: number, title: string) => {
    const newDocs = [...template.documents]
    newDocs[index] = { ...newDocs[index], title }
    setTemplate({ ...template, documents: newDocs })
  }

  const handleSave = async () => {
    if (!template.name.trim()) {
      toast.error("Please enter a template name")
      return
    }

    if (template.documents.length === 0) {
      toast.error("Please add at least one document")
      return
    }

    setIsSaving(true)
    try {
      const result = await z.mutate(
        mutators.template.create({
          name: template.name,
          description: template.description,
          documents: template.documents.map((doc) => ({
            title: doc.title,
            content: doc.content,
            parentId: doc.parentId,
            sortOrder: doc.sortOrder,
          })),
        }),
      )

      if (result?.client) {
        await result.client
      }

      toast.success("Template created successfully!")
      
      // Reset form
      setTemplate({
        name: "",
        description: "",
        documents: [],
      })
      setSelectedDocIndex(null)
    } catch (error) {
      console.error("Failed to create template:", error)
      toast.error("Failed to create template. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Metadata */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={template.name}
              onChange={(e) => setTemplate({ ...template, name: e.target.value })}
              placeholder="e.g., Developer Resume"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={template.description}
              onChange={(e) => setTemplate({ ...template, description: e.target.value })}
              placeholder="Describe what this template is for..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Documents
              </label>
              <Button size="sm" onPress={handleAddDocument}>
                <AddRegular className="size-4" />
                Add Document
              </Button>
            </div>

            <div className="border border-gray-200 rounded-lg divide-y">
              {template.documents.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No documents yet. Add one to get started.
                </div>
              ) : (
                template.documents.map((doc, index) => (
                  <div
                    key={doc.id}
                    className={`p-3 flex items-center gap-2 hover:bg-gray-50 cursor-pointer ${
                      selectedDocIndex === index ? "bg-blue-50" : ""
                    }`}
                    onClick={() => setSelectedDocIndex(index)}
                  >
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={doc.title}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleUpdateDocTitle(index, e.target.value)
                        }}
                        className="w-full text-sm font-medium bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveDocument(index)
                      }}
                      className="p-1 hover:bg-red-100 rounded text-red-600"
                    >
                      <DeleteRegular className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Editor */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content Editor
              {selectedDoc && (
                <span className="ml-2 text-gray-500 font-normal">
                  ({selectedDoc.title})
                </span>
              )}
            </label>
            <div className="border border-gray-200 rounded-lg">
              {selectedDoc ? (
                <div className="min-h-[400px] p-4">
                  <EditorContent
                    editor={editor}
                    className="prose prose-sm max-w-none focus:outline-none"
                  />
                </div>
              ) : (
                <div className="min-h-[400px] flex items-center justify-center text-gray-500">
                  Select a document to edit
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          onPress={handleSave}
          isPending={isSaving}
          disabled={!template.name || template.documents.length === 0}
        >
          <SaveRegular className="size-4" />
          Create Template
        </Button>
      </div>
    </div>
  )
}
