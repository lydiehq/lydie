import { Editor, EditorContent, useEditorState } from "@tiptap/react"
import { AnimatePresence, motion } from "motion/react"
import { Button as RACButton, Form } from "react-aria-components"
import { CircleArrowUpIcon, XIcon, SquareIcon } from "@/icons"
import { queries } from "@lydie/zero/queries"
import { type DocumentEditorHookResult } from "@/lib/editor/document-editor"
import { applyContentChanges } from "@/utils/document-changes"
import { ChatMessages } from "@/components/chat/ChatMessages"
import { useState, useImperativeHandle, type ForwardedRef, useEffect } from "react"
import { useSelectedContent } from "@/context/selected-content.context"
import { useOrganization } from "@/context/organization.context"
import type { QueryResultType } from "@rocicorp/zero"
import { useRouter } from "@tanstack/react-router"
import { ChatAlert } from "./ChatAlert"
import { useAssistantChat } from "@/hooks/use-assistant-chat"
import { useChatComposer } from "@/hooks/use-chat-composer"
import { useDocumentContext } from "@/hooks/use-document-context"
import { ChatContextList } from "@/components/chat/ChatContextList"
import { getReferenceDocumentIds } from "@/utils/parse-references"

export type DocumentChatRef = {
  focus: () => void
}

type Props = {
  contentEditor: DocumentEditorHookResult
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>
  conversationId: string
  ref: ForwardedRef<DocumentChatRef>
}

export function DocumentChat({ contentEditor, doc, conversationId, ref }: Props) {
  const { focusedContent, clearFocusedContent } = useSelectedContent()
  const { organization } = useOrganization()
  const router = useRouter()
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([])

  const {
    availableDocuments,
    contextItems,
    handleRemoveContext,
    resetDismissal,
  } = useDocumentContext({
    currentDocumentId: doc.id,
    mentionedDocumentIds,
  })

  const chatEditor = useChatComposer({
    documents: availableDocuments,
    onEnter: () => {
      const textContent = chatEditor.getTextContent()
      if (textContent.trim()) {
        handleSubmit()
      }
    },
  })

  useEffect(() => {
    const editor = chatEditor.editor
    if (!editor) return

    const updateMentions = () => {
      const textContent = chatEditor.getTextContent()
      setMentionedDocumentIds(getReferenceDocumentIds(textContent))
    }

    updateMentions()
    editor.on("update", updateMentions)

    return () => {
      editor.off("update", updateMentions)
    }
  }, [chatEditor.editor, chatEditor.getTextContent])

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (chatEditor.editor) {
        chatEditor.editor.commands.focus()
      }
    },
  }))

  const editorState = useEditorState({
    editor: contentEditor.editor,
    selector: (state) => {
      return {
        wordCount: state.editor.storage.characterCount.words(),
      }
    },
  })

  const { messages, sendMessage, stop, status, alert, setAlert } = useAssistantChat({
    conversationId,
    currentDocument: {
      id: doc.id,
      organizationId: doc.organization_id,
    },
    experimental_throttle: 100,
  })

  // Add upgrade action for usage limit errors
  useEffect(() => {
    if (alert && alert.message.includes("Daily message limit")) {
      setAlert({
        ...alert,
        action: {
          label: "Upgrade to Pro →",
          onClick: () => {
            router.navigate({
              to: "/w/$organizationSlug/settings/billing",
              params: (prev) => ({ ...prev, organizationSlug: organization.slug }),
            })
          },
        },
      })
    }
  }, [alert, router, organization.id, setAlert])

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault()
    const textContent = chatEditor.getTextContent()
    if (!textContent.trim()) return

    sendMessage({
      text: textContent,
      metadata: {
        createdAt: new Date().toISOString(),
        focusedContent,
        contextDocumentIds: Array.from(
          new Set([
            ...mentionedDocumentIds,
          ]),
        ),
        currentDocument: {
          id: doc.id,
          organizationId: doc.organization_id,
          wordCount: editorState?.wordCount,
        },
      },
    })
    chatEditor.clearContent()
    clearFocusedContent()
    contentEditor.editor?.commands.clearSelection()
    resetDismissal()
  }

  const applyContent = async (
    edits: {
      changes?: Array<{
        search: string
        replace: string
        overwrite?: boolean
      }>
      title?: string
      message?: string
    },
    onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  ) => {
    try {
      if (!contentEditor.editor) {
        throw new Error("Content editor not available for applying changes")
      }

      let result: {
        success: boolean
        error?: string
        appliedChanges?: number
        usedLLMFallback?: boolean
      } = { success: true }

      if (edits.changes && edits.changes.length > 0) {
        result = await applyContentChanges(contentEditor.editor, edits.changes, organization.id, onProgress)

        if (result.usedLLMFallback) {
          console.info("✨ LLM-assisted replacement was used for this change")
        }
      }

      if (!result.success) {
        throw new Error(result.error || "Failed to apply content changes")
      }
    } catch (error) {
      console.error("Error applying content:", error)
    }
  }

  const canStop = status === "submitted" || status === "streaming"

  return (
    <div className="flex flex-col overflow-hidden grow">
      <ChatMessages
        messages={messages}
        onApplyContent={applyContent}
        status={status}
        editor={contentEditor.editor}
        organizationId={organization.id}
      />
      <div className="p-3 relative">
        <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
        <div className="rounded-lg bg-white p-2 flex flex-col gap-y-2 z-10 relative shadow-surface">
          <AnimatePresence mode="sync">
            {alert && (
              <motion.div
                className=""
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.175, 0.885, 0.32, 1.1],
                }}
              >
                <ChatAlert alert={alert} onDismiss={() => setAlert(null)} />
              </motion.div>
            )}
            {focusedContent ? (
              <motion.div
                className=""
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.175, 0.885, 0.32, 1.1],
                }}
              >
                <Selection editor={contentEditor.editor} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex flex-col">
            <Form className="relative flex flex-col" onSubmit={handleSubmit}>
              <ChatContextList
                items={contextItems}
                onRemove={handleRemoveContext}
              />
              <EditorContent editor={chatEditor.editor} />
              <RACButton
                type={canStop ? "button" : "submit"}
                onPress={canStop ? stop : undefined}
                className="p-1 hover:bg-gray-50 rounded-md bottom-0 right-0 absolute"
                isDisabled={false}
              >
                {canStop ? (
                  <SquareIcon className="size-4 text-gray-900 fill-gray-900" />
                ) : (
                  <CircleArrowUpIcon className="size-4.5 text-gray-500" />
                )}
              </RACButton>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}

function Selection({ editor }: { editor: Editor | null }) {
  const { focusedContent, clearFocusedContent } = useSelectedContent()

  const handleClearSelection = () => {
    if (editor) {
      editor.commands.clearSelection()
      clearFocusedContent()
    }
  }

  const jumpToSelection = () => {
    if (editor) {
      editor.commands.jumpToSelection()
    }
  }

  return (
    <div className="flex items-center overflow-hidden bg-gray-50">
      <RACButton
        onPress={handleClearSelection}
        className="text-gray-500 hover:text-gray-700 p-1 rounded rounded-l-md"
      >
        <XIcon className="size-3.5" />
      </RACButton>
      <RACButton
        className="p-1 rounded relative flex-1 text-sm leading-relaxed text-gray-700 truncate italic transition-colors hover:bg-gray-100 rounded-r-md text-start"
        onPress={jumpToSelection}
      >
        "{focusedContent}"
      </RACButton>
    </div>
  )
}
