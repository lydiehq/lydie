import { useState, useRef, useLayoutEffect } from "react"
import { Button as AriaButton } from "react-aria-components"
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon, DocumentIcon } from "@/icons"
import { motion } from "motion/react"
import { StickToBottom } from "use-stick-to-bottom"
import { Button } from "@/components/generic/Button"
import { Separator } from "@/components/generic/Separator"
import { countWords } from "@/utils/text"
import { useAuth } from "@/context/auth.context"
import { isAdmin } from "@/utils/admin"
import { applyContentChanges } from "@/utils/document-changes"
import type { Editor } from "@tiptap/react"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { useNavigate, useParams } from "@tanstack/react-router"

export interface ReplaceInDocumentToolProps {
  tool: {
    state: "input-streaming" | "input-available" | "call-streaming" | "output-available" | "output-error"
    input?: {
      documentId?: string
      search?: string
      replace?: string
      overwrite?: boolean
    }
    output?: {
      documentId?: string
      search?: string
      replace?: string
      overwrite?: boolean
    }
    errorText?: string
  }
  editor: Editor | null
  organizationId: string
  className?: string
}

export function ReplaceInDocumentTool({
  tool,
  editor,
  organizationId,
  className = "",
}: ReplaceInDocumentToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [isApplied, setIsApplied] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [isUsingLLM, setIsUsingLLM] = useState(false)
  const [applyStatus, setApplyStatus] = useState<string>("")
  const contentRef = useRef<HTMLDivElement>(null)

  const { user } = useAuth()
  const navigate = useNavigate()
  const params = useParams({ strict: false })

  const targetDocumentId = tool.input?.documentId || tool.output?.documentId

  const [targetDocument] = useQuery(
    targetDocumentId
      ? queries.documents.byId({
          organizationId,
          documentId: targetDocumentId,
        })
      : null,
  )

  const replaceText = tool.input?.replace || tool.output?.replace || ""
  const isStreaming = tool.state === "input-streaming"

  const searchText = tool.input?.search || tool.output?.search || ""
  const isOverwrite = tool.input?.overwrite ?? tool.output?.overwrite ?? false

  useLayoutEffect(() => {
    if (contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight
      setHasOverflow(contentHeight > 140)
    }
  }, [replaceText])

  if (!replaceText && tool.state !== "input-streaming") {
    return null
  }

  const wordCount = countWords(replaceText)

  const handleApply = async () => {
    if (!replaceText || !editor) {
      return
    }

    setIsApplying(true)
    setApplyStatus("Applying...")

    try {
      if (targetDocumentId && targetDocumentId !== params.id) {
        setApplyStatus("Navigating to document...")
        navigate({
          to: "/w/$organizationSlug/$id",
          params: { 
            organizationSlug: params.organizationSlug as string, 
            id: targetDocumentId 
          },
        })
        
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      const result = await applyContentChanges(
        editor,
        [
          {
            search: searchText,
            replace: replaceText,
            overwrite: isOverwrite,
          },
        ],
        organizationId,
        undefined, // onProgress
        (isUsingLLM) => {
          setIsUsingLLM(isUsingLLM)
        },
      )

      if (result.success) {
        setIsApplied(true)
        setApplyStatus("")
        if (result.usedLLMFallback) {
          console.info("✨ LLM-assisted replacement was used for this change")
        }
      } else {
        setApplyStatus("Failed to apply")
        console.error("Failed to apply changes:", result.error)
      }
    } catch (error) {
      console.error("Failed to apply:", error)
      setApplyStatus("Failed to apply")
    } finally {
      setIsApplying(false)
      setIsUsingLLM(false)
    }
  }

  const handleCopy = async () => {
    if (replaceText) {
      await navigator.clipboard.writeText(replaceText)
    }
  }

  const handleDebug = async () => {
    const debugInfo = {
      toolState: tool.state,
      toolInput: tool.input,
      toolOutput: tool.output,
      toolError: tool.errorText,
      searchLength: searchText.length,
      replaceLength: replaceText.length,
      isStreaming,
      timestamp: new Date().toISOString(),
    }

    console.group("🐛 Replace In Document Tool Debug Info")
    console.log("Tool object:", tool)
    console.log("Search text:", searchText)
    console.log("Replace text:", replaceText)
    console.log("Is streaming:", isStreaming)
    console.log("Debug summary:", debugInfo)
    console.groupEnd()
  }

  const isError = tool.state === "output-error"
  const roundedWordCount = Math.floor(wordCount / 10) * 10

  const getStatusText = () => {
    if (isError) return "Failed to modify document"
    if (isApplied) return "Changes applied"
    if (isApplying) return "Applying changes"
    if (isStreaming) return "Generating content"
    if (isOverwrite) return "Overwrite document"
    return "Modify document"
  }

  const isCurrentDocument = !targetDocumentId || targetDocumentId === params.id

  return (
    <motion.div className={`p-1 bg-gray-100 rounded-[10px] my-4 relative ${className}`}>
      <div className="p-1">
        <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
          {isStreaming && <Loader2Icon className="size-3 animate-spin text-blue-500" />}
          <motion.span
            key={getStatusText()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {getStatusText()}
          </motion.span>
          {wordCount > 0 && <span className="text-gray-500">{roundedWordCount} words</span>}
        </motion.div>
        {targetDocument && !isCurrentDocument && (
          <motion.div 
            className="text-[11px] text-gray-600 flex items-center gap-1 mt-1"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DocumentIcon className="size-3" />
            <span>Target: {targetDocument.title || "Untitled document"}</span>
          </motion.div>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden relative z-10">
        <div className="p-2">
          {replaceText && (
            <div
              className="overflow-hidden relative"
              style={{
                height: isExpanded || !hasOverflow ? "auto" : 140,
              }}
            >
              <StickToBottom className="text-xs text-gray-600 overflow-y-auto" initial={{ damping: 1, stiffness: 1 }}>
                <StickToBottom.Content>
                  <div
                    ref={contentRef}
                    className="editor-content-sm"
                    dangerouslySetInnerHTML={{ __html: replaceText }}
                  />
                </StickToBottom.Content>
              </StickToBottom>
              {!isExpanded && hasOverflow && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-white to-transparent pointer-events-none" />
              )}
            </div>
          )}
          {hasOverflow && (
            <AriaButton
              onPress={() => setIsExpanded(!isExpanded)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 w-full justify-center mt-2"
            >
              {isExpanded ? (
                <div className="flex items-center gap-1">
                  <ChevronUpIcon className="size-3" />
                  <span>Show less</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <ChevronDownIcon className="size-3" />
                  <span>Show more</span>
                </div>
              )}
            </AriaButton>
          )}
          {(replaceText || isApplied) && (
            <>
              <Separator className="my-2" />
              <motion.div
                className="flex justify-end gap-2 mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {isAdmin(user) && (
                  <Button intent="secondary" size="xs" onPress={handleDebug}>
                    Debug
                  </Button>
                )}
                <Button
                  intent="secondary"
                  size="xs"
                  onPress={handleCopy}
                  isDisabled={isApplying || isStreaming}
                >
                  Copy
                </Button>
                <Button
                  intent="secondary"
                  size="xs"
                  onPress={handleApply}
                  isDisabled={isApplied || isApplying || isStreaming || !editor}
                  isPending={isApplying || isUsingLLM}
                >
                  {isApplying ? applyStatus || "Applying..." : isApplied ? "Applied" : "Apply"}
                </Button>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
