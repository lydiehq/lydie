import { AnimatePresence, motion } from "motion/react"
import { StickToBottom } from "use-stick-to-bottom"
import { format } from "date-fns"
import { Button, DialogTrigger } from "react-aria-components"
import { MoreVerticalIcon } from "@/icons"
import { Popover } from "../generic/Popover"
import { ReplaceInDocumentTool } from "./tools/ReplaceInDocumentTool"
import { SearchDocumentsTool } from "./tools/SearchDocumentsTool"
import { SearchInDocumentTool } from "./tools/SearchInDocumentTool"
import { ReadDocumentTool } from "./tools/ReadDocumentTool"
import { ReadCurrentDocumentTool } from "./tools/ReadCurrentDocumentTool"
import { ListDocumentsTool } from "./tools/ListDocumentsTool"
import { CreateDocumentTool } from "./tools/CreateDocumentTool"
import { MoveDocumentsTool } from "./tools/MoveDocumentsTool"
import { WebSearchTool } from "./tools/WebSearchTool"
import { UserMessage } from "./Message"
import { Streamdown } from "streamdown"
import type { Editor } from "@tiptap/react"
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"

type Props = {
  messages: DocumentChatAgentUIMessage[]
  status: "submitted" | "streaming" | "ready" | "error"
  editor?: Editor | null
  organizationId: string
  onApplyContent?: (
    edits: any,
    onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  ) => void
}

export function ChatMessages({ messages, status, editor = null, organizationId, onApplyContent }: Props) {
  const lastMessage = messages[messages.length - 1]
  const isSubmitting = status === "submitted" && messages.length > 0 && lastMessage?.role === "user"

  // Show loading indicator until text actually appears in the assistant message
  const shouldShowLoading =
    isSubmitting ||
    (status === "streaming" &&
      lastMessage?.role === "assistant" &&
      !lastMessage.parts?.some((part: any) => part.type === "text" && part.text?.trim()))

  return (
    <StickToBottom
      className="flex-1 overflow-hidden scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-300 scrollbar-track-gray-50"
      resize="smooth"
      initial="instant"
    >
      <StickToBottom.Content className="flex flex-col gap-y-2 p-3">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <div key={message.id}>
              {message.role === "user" ? (
                <UserMessage message={message} />
              ) : (
                <AssistantMessageWithTools
                  message={message}
                  onApplyContent={onApplyContent}
                  status={status}
                  isLastMessage={index === messages.length - 1}
                  editor={editor}
                  organizationId={organizationId}
                />
              )}
            </div>
          ))}
        </AnimatePresence>
        {shouldShowLoading && <ThinkingIndicator />}
      </StickToBottom.Content>
    </StickToBottom>
  )
}

function ThinkingIndicator() {
  return (
    <motion.div
      className="flex justify-start w-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
        >
          <svg
            className="size-3.5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </motion.div>
        <div className="flex items-center gap-1 text-gray-600 text-sm">
          <span>Thinking</span>
          <span className="inline-flex gap-0.5">
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0,
              }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0.2,
              }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0.4,
              }}
            >
              .
            </motion.span>
          </span>
        </div>
      </div>
    </motion.div>
  )
}

function AssistantMessageWithTools({
  message,
  onApplyContent,
  status,
  isLastMessage,
  editor,
  organizationId,
}: {
  message: DocumentChatAgentUIMessage
  onApplyContent?: (
    edits: any,
    onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  ) => void
  status: "submitted" | "streaming" | "ready" | "error"
  isLastMessage: boolean
  editor: Editor | null
  organizationId: string
}) {
  const formatDuration = (duration?: number) => {
    if (!duration) return ""
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(1)}s`
  }

  const replaceTools = message.parts.filter(
    (part: any) => part.type === "tool-replace_in_document" && (part.input || part.output),
  )

  const shouldShowMetadata = status === "ready" || !isLastMessage

  const handleApplyAll = async () => {
    if (!onApplyContent || replaceTools.length === 0) {
      return
    }

    const allChanges = replaceTools
      .map((tool: any) => {
        const search = tool.input?.search || tool.output?.search || ""
        const replace = tool.input?.replace || tool.output?.replace || ""
        const overwrite = tool.input?.overwrite ?? tool.output?.overwrite ?? false
        return { search, replace, overwrite }
      })
      .filter((change) => change.replace !== undefined)

    if (allChanges.length === 0) {
      return
    }

    onApplyContent({
      changes: allChanges,
    })
  }

  return (
    <motion.div
      className="flex justify-start w-full gap-y-1 flex-col"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex flex-col">
        {message.parts.map((part: any, index: number) => (
          <MessagePart
            key={index}
            part={part}
            status={status}
            isLastMessage={isLastMessage}
            editor={editor}
            organizationId={organizationId}
          />
        ))}
      </div>
      {shouldShowMetadata && (
        <div className="flex justify-between items-center">
          <div className="flex flex-col gap-y-1">
            {message.metadata?.createdAt && (
              <span className="text-gray-400 text-[11px]">
                {format(new Date(message.metadata.createdAt), "HH:mm")}
              </span>
            )}
          </div>
          <div className="flex gap-x-1">
            <DialogTrigger>
              <Button className="p-0.5 hover:bg-gray-100 rounded">
                <MoreVerticalIcon className="size-3" />
              </Button>
              <Popover>
                <div className="flex flex-col gap-y-1 text-[11px] text-gray-500 divide-y divide-gray-200">
                  {message.metadata?.duration && (
                    <span className="p-0.5">Response time: {formatDuration(message.metadata.duration)}</span>
                  )}
                  {message.metadata?.usage && (
                    <span className="p-0.5">Tokens used: {message.metadata.usage}</span>
                  )}
                  {onApplyContent && replaceTools.length > 0 && (
                    <div className="p-0.5 pt-1">
                      <Button
                        onPress={handleApplyAll}
                        className="text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded w-full text-left"
                      >
                        Apply all changes ({replaceTools.length})
                      </Button>
                    </div>
                  )}
                </div>
              </Popover>
            </DialogTrigger>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function MessagePart({
  part,
  status,
  isLastMessage,
  editor,
  organizationId,
}: {
  part: any
  status: "submitted" | "streaming" | "ready" | "error"
  isLastMessage: boolean
  editor: Editor | null
  organizationId: string
}) {
  if (part.type === "text") {
    return (
      <Streamdown
        isAnimating={status === "streaming" && isLastMessage}
        parseIncompleteMarkdown={true}
        components={{
          p: ({ children }) => <p className="text-gray-700 text-sm/relaxed">{children}</p>,
          li: ({ children }) => <li className="text-gray-700 text-sm/relaxed">{children}</li>,
        }}
      >
        {part.text}
      </Streamdown>
    )
  }

  if (part.type === "tool-replace_in_document") {
    return <ReplaceInDocumentTool tool={part} editor={editor} organizationId={organizationId} />
  }

  if (part.type === "tool-search_documents") {
    return <SearchDocumentsTool tool={part} />
  }

  if (part.type === "tool-search_in_document") {
    return <SearchInDocumentTool tool={part} />
  }

  if (part.type === "tool-read_document") {
    return <ReadDocumentTool tool={part} />
  }

  if (part.type === "tool-read_current_document") {
    return <ReadCurrentDocumentTool tool={part} />
  }

  if (part.type === "tool-list_documents") {
    return <ListDocumentsTool tool={part} />
  }

  if (part.type === "tool-create_document") {
    return <CreateDocumentTool tool={part} />
  }

  if (part.type === "tool-move_documents") {
    return <MoveDocumentsTool tool={part} />
  }

  if (part.type === "tool-web_search") {
    return <WebSearchTool tool={part} />
  }

  if (part.type?.startsWith("tool-") && import.meta.env.DEV) {
    console.log("Unknown tool type:", part.type, part)
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 text-sm">
        <div className="font-medium text-yellow-800">Debug: Unknown Tool</div>
        <div className="text-yellow-700 text-xs mt-1">Type: {part.type}</div>
        <details className="mt-2">
          <summary className="text-xs cursor-pointer text-yellow-600">Show raw data</summary>
          <pre className="text-xs mt-1 bg-yellow-100 p-2 rounded overflow-auto">
            {JSON.stringify(part, null, 2)}
          </pre>
        </details>
      </div>
    )
  }

  return null
}
