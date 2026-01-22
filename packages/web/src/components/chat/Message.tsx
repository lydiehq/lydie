import { motion } from "motion/react"
import { Streamdown } from "streamdown"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { useOrganization } from "@/context/organization.context"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { parseReferences, type ParsedTextSegment } from "@/utils/parse-references"
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"
import { format } from "date-fns"

export interface MessageProps {
  message: DocumentChatAgentUIMessage
  status: "submitted" | "streaming" | "ready" | "error"
  isLastMessage: boolean
  className?: string
}

export function Message({ message, status, isLastMessage, className = "" }: MessageProps) {
  if (message.role === "user") {
    return <UserMessage message={message} className={className} />
  }

  return (
    <AssistantMessage message={message} status={status} isLastMessage={isLastMessage} className={className} />
  )
}

export function UserMessage({
  message,
  className = "",
}: {
  message: DocumentChatAgentUIMessage
  className?: string
}) {
  return (
    <motion.div
      className={`flex justify-end ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex flex-col items-end max-w-[80%]">
        <div className="bg-black/4 text-gray-700 rounded-l-lg rounded-br-lg rounded-tr-sm p-2 flex flex-col gap-y-1">
          {message.parts?.map((part: any, index: number) => {
            if (part.type === "text") {
              return <TextWithReferences key={index} text={part.text} className="text-sm/relaxed" />
            }
            return null
          })}
        </div>
        <div className="flex flex-col items-end gap-y-1 mt-1">
          <MessageContext message={message} align="right" />
          {message.metadata?.createdAt && (
            <span className="text-xs text-gray-400">
              {format(new Date(message.metadata.createdAt), "HH:mm")}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function AssistantMessage({
  message,
  status,
  isLastMessage,
  className = "",
}: {
  message: DocumentChatAgentUIMessage
  status: "submitted" | "streaming" | "ready" | "error"
  isLastMessage: boolean
  className?: string
}) {
  // Show metadata when:
  // 1. Status is "ready" (response complete), OR
  // 2. This is not the last message (previous messages are always complete)
  const shouldShowMetadata = status === "ready" || !isLastMessage

  return (
    <motion.div
      className={`flex justify-start w-full gap-y-1 flex-col ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex flex-col gap-y-2 max-w-[80%]">
        <div className="bg-gray-100 text-gray-900 rounded-r-lg rounded-bl-lg rounded-tl-sm p-2 whitespace-pre-wrap">
          {message.parts?.map((part: any, index: number) => {
            if (part.type === "text") {
              return (
                <Streamdown
                  key={index}
                  isAnimating={status === "streaming" && isLastMessage}
                  parseIncompleteMarkdown={true}
                >
                  {part.text}
                </Streamdown>
              )
            }
            return null
          })}
        </div>
        {shouldShowMetadata && (
          <div className="flex flex-col gap-y-1">
            <MessageContext message={message} align="left" />
            {message.metadata?.createdAt && (
              <span className="text-xs text-gray-400">
                {format(new Date(message.metadata.createdAt), "HH:mm")}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/**
 * Renders text with inline reference pills
 * Optimized to only parse when references are detected
 */
export function TextWithReferences({ text, className = "" }: { text: string; className?: string }) {
  const segments = useMemo(() => parseReferences(text), [text])

  return (
    <span className={`whitespace-pre-wrap ${className}`}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.content}</span>
        }

        if (segment.type === "reference" && segment.reference) {
          return <ReferenceSegment key={index} reference={segment.reference} />
        }

        return null
      })}
    </span>
  )
}

function ReferenceSegment({ reference }: { reference: ParsedTextSegment["reference"] }) {
  if (!reference) return null

  if (reference.type === "document") {
    return <DocumentReferencePill documentId={reference.id} />
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-medium">
      {reference.type}
    </span>
  )
}

function DocumentReferencePill({ documentId }: { documentId: string }) {
  const { organization } = useOrganization()
  const [document] = useQuery(
    queries.documents.byId({
      organizationId: organization.id,
      documentId,
    }),
  )

  const title = document?.title || "Untitled"
  const href = `/w/${organization.id}/${documentId}`

  return (
    <Link
      to={href}
      className="inline-flex px-0.5 rounded-sm items-center gap-x-1 relative before:bg-white/40 hover:before:bg-white/80 before:absolute before:inset-x-0 before:inset-y-px before:rounded-sm"
      title={`Open document: ${title}`}
    >
      <span className="max-w-[150px] truncate text-[0.875rem] relative">@{title}</span>
    </Link>
  )
}

/**
 * Displays context documents used for a message as a list
 */
function MessageContext({
  message,
  align = "left",
}: {
  message: DocumentChatAgentUIMessage
  align?: "left" | "right"
}) {
  const { organization } = useOrganization()
  const metadata = message.metadata as any

  const contextDocuments = metadata?.contextDocuments || []
  const currentDocumentId = metadata?.currentDocumentId

  const allContextDocs = useMemo(() => {
    const docs: Array<{ id: string; title: string }> = []
    const seenIds = new Set<string>()

    // Add current document from contextDocuments if it exists
    if (currentDocumentId) {
      const currentDoc = contextDocuments.find((doc: { id: string }) => doc.id === currentDocumentId)
      if (currentDoc && !seenIds.has(currentDoc.id)) {
        docs.push(currentDoc)
        seenIds.add(currentDoc.id)
      }
    }

    // Add all other context documents
    for (const doc of contextDocuments) {
      if (!seenIds.has(doc.id)) {
        docs.push(doc)
        seenIds.add(doc.id)
      }
    }

    return docs
  }, [currentDocumentId, contextDocuments])

  if (allContextDocs.length === 0) {
    return null
  }

  return (
    <div className={`flex flex-col gap-0.5 ${align === "right" ? "items-end" : "items-start"}`}>
      <div className="text-[10px] text-gray-500 font-medium mb-0.5">Context documents:</div>
      <ul className={`flex flex-col gap-0.5 ${align === "right" ? "items-end" : "items-start"}`}>
        {allContextDocs.map((doc) => (
          <li key={doc.id}>
            <Link
              to="/w/$organizationSlug/$id"
              params={{ organizationSlug: organization.slug, id: doc.id }}
              className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-900 hover:underline transition-colors"
              title={`Open document: ${doc.title}`}
            >
              <svg
                className="size-3 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="max-w-[200px] truncate">{doc.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
