import { useState, useRef, useLayoutEffect } from "react"
import { Button as AriaButton } from "react-aria-components"
import {
  ChevronDownRegular,
  ChevronUpRegular,
  ArrowClockwiseRegular,
  DocumentFilled,
} from "@fluentui/react-icons"
import { motion } from "motion/react"
import { StickToBottom } from "use-stick-to-bottom"
import { Button } from "@/components/generic/Button"
import { Separator } from "@/components/generic/Separator"
import { countWords } from "@/utils/text"
import { useAuth } from "@/context/auth.context"
import { isAdmin } from "@/utils/admin"
import { applyContentChanges } from "@/utils/document-changes"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useDocumentEditor, useTitleEditor } from "@/hooks/useEditor"
import { useSetAtom, useAtomValue } from "jotai"
import { pendingEditorChangeAtom, pendingChangeStatusAtom } from "@/atoms/editor"
import { useEffect } from "react"
import { applyTitleChange } from "@/utils/title-changes"
import { useZero } from "@/services/zero"

export interface ReplaceInDocumentToolProps {
  tool: {
    state: "input-streaming" | "input-available" | "call-streaming" | "output-available" | "output-error"
    input?: {
      documentId?: string
      title?: string
      search?: string
      replace?: string
    }
    output?: {
      documentId?: string
      title?: string
      search?: string
      replace?: string
    }
    errorText?: string
  }
  organizationId: string
  className?: string
}

export function ReplaceInDocumentTool({ tool, organizationId, className = "" }: ReplaceInDocumentToolProps) {
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
  const z = useZero()

  // Access the editors from global state - only this component will re-render when editors change
  const editor = useDocumentEditor()
  const titleEditor = useTitleEditor()
  const setPendingChange = useSetAtom(pendingEditorChangeAtom)
  const setPendingChangeStatus = useSetAtom(pendingChangeStatusAtom)
  const pendingChange = useAtomValue(pendingEditorChangeAtom)
  const pendingChangeStatus = useAtomValue(pendingChangeStatusAtom)

  const targetDocumentId = tool.input?.documentId || tool.output?.documentId
  const newTitle = tool.input?.title || tool.output?.title
  const replaceText = tool.input?.replace || tool.output?.replace || ""
  const searchText = tool.input?.search || tool.output?.search || ""

  // Sync state with pending change status
  useEffect(() => {
    // Check if there's a pending change that matches this tool
    const isMatchingPendingChange =
      pendingChange &&
      pendingChange.documentId === (targetDocumentId || params.id) &&
      pendingChange.search === searchText &&
      pendingChange.replace === replaceText &&
      pendingChange.title === newTitle

    if (isMatchingPendingChange) {
      // Sync with the pending change status
      if (pendingChangeStatus === "applying") {
        setIsApplying(true)
        setIsUsingLLM(false) // Will be set by the apply function if needed
        setApplyStatus("Applying...")
      } else if (pendingChangeStatus === "applied") {
        setIsApplied(true)
        setIsApplying(false)
        setIsUsingLLM(false)
        setApplyStatus("")
      } else if (pendingChangeStatus === "failed") {
        setIsApplied(false)
        setIsApplying(false)
        setIsUsingLLM(false)
        setApplyStatus("Failed to apply")
      } else if (pendingChangeStatus === "pending") {
        setIsApplying(true)
        setApplyStatus("Navigating to document...")
      }
    } else if (!pendingChange && pendingChangeStatus === null) {
      // If there's no pending change and no status, and we were navigating/applying,
      // it means the change was applied and cleared
      if (isApplying && (applyStatus === "Navigating to document..." || applyStatus === "Applying...")) {
        // Check if we're on the target document (meaning navigation completed)
        if (targetDocumentId === params.id || !targetDocumentId) {
          setIsApplied(true)
          setIsApplying(false)
          setIsUsingLLM(false)
          setApplyStatus("")
        }
      }
    }
  }, [
    pendingChange,
    pendingChangeStatus,
    targetDocumentId,
    params.id,
    searchText,
    replaceText,
    newTitle,
    isApplying,
    applyStatus,
  ])

  const [targetDocument] = useQuery(
    targetDocumentId
      ? queries.documents.byId({
          organizationId,
          documentId: targetDocumentId,
        })
      : null,
  )

  const isStreaming = tool.state === "input-streaming"
  const isFullReplacement = searchText === ""

  useLayoutEffect(() => {
    if (contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight
      setHasOverflow(contentHeight > 140)
    }
  }, [replaceText])

  if (!replaceText && !newTitle && tool.state !== "input-streaming") {
    return null
  }

  const wordCount = countWords(replaceText)

  const handleApply = async () => {
    if (!replaceText && !newTitle) {
      return
    }

    // If we're applying to a different document, set pending change and navigate
    if (targetDocumentId && targetDocumentId !== params.id) {
      setIsApplying(true)
      setApplyStatus("Navigating to document...")

      // Store the pending change and set status
      setPendingChange({
        documentId: targetDocumentId,
        title: newTitle,
        search: searchText,
        replace: replaceText,
        organizationId,
      })
      setPendingChangeStatus("pending")

      // Navigate - the Editor component will apply changes when ready
      setTimeout(() => {
        navigate({
          to: "/w/$organizationSlug/$id",
          params: {
            organizationSlug: params.organizationSlug as string,
            id: targetDocumentId,
          },
        })
      }, 100)

      return
    }

    // For current document, we need the editors
    const currentDocId = targetDocumentId || params.id
    if (!currentDocId || (!editor && !titleEditor)) {
      return
    }

    setIsApplying(true)
    setApplyStatus("Applying...")

    try {
      let contentSuccess = true
      let titleSuccess = true

      // Apply title change if provided
      if (newTitle && titleEditor) {
        const titleResult = await applyTitleChange(
          titleEditor,
          newTitle,
          currentDocId,
          organizationId,
          z as any,
        )
        titleSuccess = titleResult.success
        if (!titleSuccess) {
          console.error("Failed to apply title change:", titleResult.error)
        }
      }

      // Apply content changes if provided
      if (replaceText && editor) {
        const result = await applyContentChanges(
          editor,
          [
            {
              search: searchText,
              replace: replaceText,
            },
          ],
          organizationId,
          undefined, // onProgress
          (isUsingLLM) => {
            setIsUsingLLM(isUsingLLM)
          },
        )

        contentSuccess = result.success
        if (result.success) {
          if (result.usedLLMFallback) {
            console.info("✨ LLM-assisted replacement was used for this change")
          }
        } else {
          console.error("Failed to apply content changes:", result.error)
        }
      }

      if (contentSuccess && titleSuccess) {
        setIsApplied(true)
        setApplyStatus("")
      } else {
        setApplyStatus("Failed to apply")
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
      try {
        // Extract plain text from HTML for fallback
        const tempDiv = document.createElement("div")
        tempDiv.innerHTML = replaceText
        const plainText = tempDiv.textContent || tempDiv.innerText || ""

        // Create a ClipboardItem with both HTML and plain text formats
        // This allows Word and other applications to preserve formatting
        const clipboardItem = new ClipboardItem({
          "text/html": new Blob([replaceText], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        })

        await navigator.clipboard.write([clipboardItem])
      } catch (error) {
        // Fallback to plain text if ClipboardItem API is not supported
        console.warn("Rich text copy failed, falling back to plain text:", error)
        await navigator.clipboard.writeText(replaceText)
      }
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
    if (isFullReplacement) return "Replace entire document"
    return "Modify document"
  }

  return (
    <motion.div className={`p-1 bg-gray-100 rounded-[10px] my-4 relative ${className}`}>
      <div className="p-1">
        <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
          {isStreaming && <ArrowClockwiseRegular className="size-3 animate-spin text-blue-500" />}
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
        {targetDocument && (
          <motion.div
            className="text-[11px] text-gray-600 flex items-center gap-1 mt-1"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DocumentFilled className="size-3" />
            <span>Target: {targetDocument.title || "Untitled document"}</span>
          </motion.div>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden relative z-10">
        <div className="p-2">
          {newTitle && (
            <div className="mb-3 pb-3 border-b border-gray-200">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Title
              </div>
              <div className="text-lg font-semibold text-gray-900">{newTitle}</div>
            </div>
          )}
          {replaceText && (
            <div
              className="overflow-hidden relative"
              style={{
                height: isExpanded || !hasOverflow ? "auto" : 140,
              }}
            >
              {newTitle && (
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Content
                </div>
              )}
              <StickToBottom
                className="text-xs text-gray-600 overflow-y-auto"
                initial={{ damping: 1, stiffness: 1 }}
              >
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
                  <ChevronUpRegular className="size-3" />
                  <span>Show less</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <ChevronDownRegular className="size-3" />
                  <span>Show more</span>
                </div>
              )}
            </AriaButton>
          )}
          {(replaceText || newTitle || isApplied) && (
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
                {replaceText && (
                  <Button intent="secondary" size="xs" onPress={handleCopy}>
                    Copy
                  </Button>
                )}
                <Button
                  intent="secondary"
                  size="xs"
                  onPress={handleApply}
                  isDisabled={isApplied || isApplying || isStreaming}
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
