import { ArrowClockwiseRegular } from "@fluentui/react-icons"
import { motion } from "motion/react"
import { countWords } from "@/utils/text"
import { useOrganization } from "@/context/organization.context"
import { StickToBottom } from "use-stick-to-bottom"
import { Button } from "@/components/generic/Button"
import { Separator } from "@/components/generic/Separator"

type Props = {
  tool: {
    toolCallId: string
    state?: "input-streaming" | "input-available" | "call-streaming" | "output-available" | "output-error"
    input?: {
      title?: string
      content?: string
    }
    output?: {
      state?: "success" | "error"
      message?: string
      document?: {
        id: string
        title: string
        slug: string
        parentId?: string | null
      }
      contentApplied?: boolean
      error?: string
    }
  }
}

export function CreateDocumentTool({ tool }: Props) {
  const { output, input } = tool

  const documentId = output?.document?.id
  const fullContent = input?.content || ""

  const isInputStreaming = tool.state === "input-streaming"
  const isCreated = !!documentId
  const isError = output?.state === "error" || tool.state === "output-error"
  const isSuccess = output?.state === "success"

  const hasContent = fullContent.length > 0
  const wordCount = countWords(fullContent)

  const roundedWordCount = Math.floor(wordCount / 10) * 10

  const getStatusText = () => {
    if (isError) return "Failed to create document"
    if (isCreated && isSuccess) return "Document created"
    if (isInputStreaming && hasContent) return "Writing content"
    return "Writing content"
  }

  return (
    <motion.div className="p-1 bg-gray-100 rounded-[10px] my-4 relative">
      <div className="p-1">
        <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
          <motion.span
            key={getStatusText()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {getStatusText()}
          </motion.span>
          {hasContent && wordCount > 0 && <span className="text-gray-500">{roundedWordCount} words</span>}
        </motion.div>
      </div>
      <div className="relative">
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: -2 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden absolute h-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2  w-[calc(100%-1rem)] z-0 opacity-80"
        />
        <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden relative z-10">
          <div className="p-2">
            <StickToBottom className="text-xs text-gray-600 h-56 overflow-y-auto" initial={{ damping: 1, stiffness: 1 }}>
              <StickToBottom.Content>
                <div className="editor-content-sm" dangerouslySetInnerHTML={{ __html: fullContent }} />
              </StickToBottom.Content>
            </StickToBottom>
            {documentId && (
              <>
                <Separator className="my-2" />
                <motion.div
                  className="flex justify-end mt-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Button
                    intent="secondary"
                    size="xs"
                    to="/w/$organizationSlug/$id"
                    from="/w/$organizationSlug"
                    params={{
                      id: documentId,
                    }}
                  >
                    Open Document
                  </Button>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
