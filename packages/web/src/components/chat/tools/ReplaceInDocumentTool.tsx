import { ArrowClockwiseRegular, ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { useEffect } from "react";
import { Button as AriaButton } from "react-aria-components";
import { StickToBottom } from "use-stick-to-bottom";

import {
  pendingChangeStatusAtom,
  pendingEditorChangeAtom,
  proposedChangeAtom,
} from "@/atoms/editor";
import { useAuth } from "@/context/auth.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useActiveDocumentId, useEditorRegistry } from "@/hooks/use-editor";
import { useZero } from "@/services/zero";
import { isAdmin } from "@/utils/admin";
import { applyContentChanges, findChangeRange } from "@/utils/document-changes";
import { countWords } from "@/utils/text";
import { applyTitleChange } from "@/utils/title-changes";

export interface ReplaceInDocumentToolProps {
  tool: {
    toolCallId: string;
    state:
      | "input-streaming"
      | "input-available"
      | "call-streaming"
      | "output-available"
      | "output-error";
    input?: {
      documentId?: string;
      title?: string;
      selectionWithEllipsis?: string;
      replace?: string;
    };
    output?: {
      documentId?: string;
      title?: string;
      selectionWithEllipsis?: string;
      replace?: string;
    };
    errorText?: string;
  };
  organizationId: string;
  className?: string;
}

export function ReplaceInDocumentTool({
  tool,
  organizationId,
  className = "",
}: ReplaceInDocumentToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isUsingLLM, setIsUsingLLM] = useState(false);
  const [applyStatus, setApplyStatus] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const applyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const z = useZero();
  const registry = useEditorRegistry();
  const activeDocumentId = useActiveDocumentId();

  // Get target document ID
  const targetDocumentId = tool.input?.documentId || tool.output?.documentId;

  // Look up editors in the registry for the target document
  const targetInstance = targetDocumentId
    ? registry.get(targetDocumentId)
    : activeDocumentId
      ? registry.get(activeDocumentId)
      : undefined;

  // Get active document editors as fallback
  const activeInstance = activeDocumentId ? registry.get(activeDocumentId) : undefined;

  // Use target document's editors if available, otherwise fall back to active document's editors
  const editor = targetInstance?.contentEditor ?? activeInstance?.contentEditor ?? null;
  const titleEditor = targetInstance?.titleEditor ?? activeInstance?.titleEditor ?? null;

  const setPendingChange = useSetAtom(pendingEditorChangeAtom);
  const setPendingChangeStatus = useSetAtom(pendingChangeStatusAtom);
  const pendingChange = useAtomValue(pendingEditorChangeAtom);
  const pendingChangeStatus = useAtomValue(pendingChangeStatusAtom);
  const { createDocument } = useDocumentActions();

  // Extract other tool data
  const newTitle = tool.input?.title || tool.output?.title;
  const replaceText = tool.input?.replace || tool.output?.replace || "";
  const selectionWithEllipsis =
    tool.input?.selectionWithEllipsis || tool.output?.selectionWithEllipsis || "";

  // Reset state when a new tool call starts
  useEffect(() => {
    setIsApplied(false);
    setIsApplying(false);
    setIsUsingLLM(false);
    setApplyStatus("");
    setErrorMessage("");

    // Clear any pending timeout
    if (applyTimeoutRef.current) {
      clearTimeout(applyTimeoutRef.current);
      applyTimeoutRef.current = null;
    }
  }, [tool.toolCallId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (applyTimeoutRef.current) {
        clearTimeout(applyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const isMatchingPendingChange =
      pendingChange &&
      pendingChange.documentId === (targetDocumentId || params.id) &&
      pendingChange.selectionWithEllipsis === selectionWithEllipsis &&
      pendingChange.replace === replaceText &&
      pendingChange.title === newTitle;

    if (isMatchingPendingChange) {
      // Clear errors when syncing with pending change
      setErrorMessage("");

      if (pendingChangeStatus === "applying") {
        setIsApplying(true);
        setIsUsingLLM(false); // Will be set by the apply function if needed
        setApplyStatus("Applying...");
      } else if (pendingChangeStatus === "applied") {
        setIsApplied(true);
        setIsApplying(false);
        setIsUsingLLM(false);
        setApplyStatus("");

        // Clear timeout on successful apply
        if (applyTimeoutRef.current) {
          clearTimeout(applyTimeoutRef.current);
          applyTimeoutRef.current = null;
        }
      } else if (pendingChangeStatus === "failed") {
        setIsApplied(false);
        setIsApplying(false);
        setIsUsingLLM(false);
        setApplyStatus("");
        setErrorMessage("Failed to apply changes. Please try again.");

        // Clear timeout on failure
        if (applyTimeoutRef.current) {
          clearTimeout(applyTimeoutRef.current);
          applyTimeoutRef.current = null;
        }
      } else if (pendingChangeStatus === "pending") {
        setIsApplying(true);
        setApplyStatus("Navigating to document...");
      }
    } else if (!pendingChange && pendingChangeStatus === null) {
      // Pending change was cleared - check if we should complete
      if (
        isApplying &&
        (applyStatus === "Navigating to document..." || applyStatus === "Applying...")
      ) {
        if (targetDocumentId === params.id || !targetDocumentId) {
          setIsApplied(true);
          setIsApplying(false);
          setIsUsingLLM(false);
          setApplyStatus("");
          setErrorMessage("");

          // Clear timeout on completion
          if (applyTimeoutRef.current) {
            clearTimeout(applyTimeoutRef.current);
            applyTimeoutRef.current = null;
          }
        }
      }
    }
  }, [
    pendingChange,
    pendingChangeStatus,
    targetDocumentId,
    params.id,
    selectionWithEllipsis,
    replaceText,
    newTitle,
    isApplying,
    applyStatus,
  ]);

  const [targetDocument] = useQuery(
    targetDocumentId
      ? queries.documents.byId({
          organizationId,
          documentId: targetDocumentId,
        })
      : null,
  );

  // Proposed change diff state
  const setProposedChange = useSetAtom(proposedChangeAtom);
  const proposedChange = useAtomValue(proposedChangeAtom);
  const isPreviewing = proposedChange?.toolCallId === tool.toolCallId;

  // Only disable during input streaming (when AI is generating the tool parameters)
  // Don't disable during call-streaming or after output is available
  const isInputStreaming = tool.state === "input-streaming";
  const isCallStreaming = tool.state === "call-streaming";
  const hasOutput = tool.state === "output-available" || tool.output != null;
  const isFullReplacement = selectionWithEllipsis === "";

  useLayoutEffect(() => {
    if (contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight;
      setHasOverflow(contentHeight > 140);
    }
  }, [replaceText]);

  if (!replaceText && !newTitle && tool.state !== "input-streaming") {
    return null;
  }

  const wordCount = countWords(replaceText);

  const handleApply = async () => {
    // Clear any previous errors
    setErrorMessage("");

    // Validate content
    if (!replaceText && !newTitle) {
      const error = "No content to apply. Please try reloading or asking the AI again.";
      setErrorMessage(error);
      console.error("Apply failed: No content", { replaceText, newTitle });
      return;
    }

    // Handle navigation to different document
    if (targetDocumentId && targetDocumentId !== params.id) {
      setIsApplying(true);
      setApplyStatus("Navigating to document...");
      setErrorMessage("");

      // Store the pending change and set status
      setPendingChange({
        documentId: targetDocumentId,
        title: newTitle,
        selectionWithEllipsis,
        replace: replaceText,
        organizationId,
      });
      setPendingChangeStatus("pending");

      // Safety timeout in case navigation fails
      applyTimeoutRef.current = setTimeout(() => {
        if (isApplying) {
          console.error("Navigation timeout - resetting state");
          setIsApplying(false);
          setApplyStatus("");
          setErrorMessage("Navigation took too long. Please try again.");
          setPendingChangeStatus(null);
          setPendingChange(null);
        }
      }, 5000);

      setTimeout(() => {
        navigate({
          to: "/w/$organizationSlug/$id",
          params: {
            organizationSlug: params.organizationSlug as string,
            id: targetDocumentId,
          },
        });
      }, 100);

      return;
    }

    const currentDocId = targetDocumentId || params.id;

    // Validate preconditions with detailed feedback
    if (!currentDocId) {
      const error = "No document selected. Please open a document first.";
      setErrorMessage(error);
      console.error("Apply failed: No document ID", { targetDocumentId, paramsId: params.id });
      return;
    }

    // If editors aren't ready, use the pending change mechanism
    // The Editor component's useEffect will apply changes once editors are initialized
    const needsContentEditor = !!replaceText;
    const needsTitleEditor = !!newTitle;
    const hasContentEditor = !!editor;
    const hasTitleEditor = !!titleEditor;

    if ((needsContentEditor && !hasContentEditor) || (needsTitleEditor && !hasTitleEditor)) {
      console.log("Editors not ready, using pending change mechanism", {
        needsContentEditor,
        hasContentEditor,
        needsTitleEditor,
        hasTitleEditor,
      });

      setIsApplying(true);
      setApplyStatus("Waiting for editor to initialize...");
      setErrorMessage("");

      // Store the pending change - Editor.tsx useEffect will apply it
      setPendingChange({
        documentId: currentDocId,
        title: newTitle,
        selectionWithEllipsis,
        replace: replaceText,
        organizationId,
      });
      setPendingChangeStatus("pending");

      // Safety timeout in case editor never initializes
      applyTimeoutRef.current = setTimeout(() => {
        if (isApplying) {
          console.error("Editor initialization timeout - resetting state");
          setIsApplying(false);
          setApplyStatus("");
          setErrorMessage("Editor failed to initialize. Please try reloading the document.");
          setPendingChangeStatus(null);
          setPendingChange(null);
        }
      }, 10000);

      return;
    }

    setIsApplying(true);
    setApplyStatus("Applying...");
    setErrorMessage("");

    // Safety timeout to prevent stuck state (30 seconds)
    applyTimeoutRef.current = setTimeout(() => {
      if (isApplying) {
        console.error("Apply timeout - resetting state");
        setIsApplying(false);
        setIsUsingLLM(false);
        setApplyStatus("");
        setErrorMessage("Operation timed out. Please try again or reload the document.");
      }
    }, 30000);

    try {
      let contentSuccess = true;
      let titleSuccess = true;
      let contentError = "";
      let titleError = "";

      if (newTitle && titleEditor) {
        const titleResult = await applyTitleChange(
          titleEditor,
          newTitle,
          currentDocId,
          organizationId,
          z as any,
        );
        titleSuccess = titleResult.success;
        if (!titleSuccess) {
          titleError = titleResult.error || "Unknown title error";
          console.error("Failed to apply title change:", titleResult.error);
        }
      }

      if (replaceText && editor) {
        const result = await applyContentChanges(
          editor,
          [
            {
              selectionWithEllipsis,
              replace: replaceText,
            },
          ],
          organizationId,
          undefined, // onProgress
          (isUsingLLM) => {
            setIsUsingLLM(isUsingLLM);
          },
        );

        contentSuccess = result.success;
        if (result.success) {
          if (result.usedLLMFallback) {
            console.info("✨ LLM-assisted replacement was used for this change");
          }
        } else {
          contentError = result.error || "Unknown content error";
          console.error("Failed to apply content changes:", result.error);
        }
      }

      // Clear timeout on success/failure
      if (applyTimeoutRef.current) {
        clearTimeout(applyTimeoutRef.current);
        applyTimeoutRef.current = null;
      }

      if (contentSuccess && titleSuccess) {
        setIsApplied(true);
        setApplyStatus("");
        setErrorMessage("");
      } else {
        const errors = [contentError, titleError].filter(Boolean);
        const errorMsg =
          errors.length > 0
            ? `Failed: ${errors.join(", ")}`
            : "Failed to apply. Please try reloading the document.";
        setApplyStatus("");
        setErrorMessage(errorMsg);
      }
    } catch (error) {
      console.error("Failed to apply:", error);

      // Clear timeout
      if (applyTimeoutRef.current) {
        clearTimeout(applyTimeoutRef.current);
        applyTimeoutRef.current = null;
      }

      const errorMsg =
        error instanceof Error
          ? `Error: ${error.message}`
          : "Unexpected error. Please try reloading the document.";
      setApplyStatus("");
      setErrorMessage(errorMsg);
    } finally {
      setIsApplying(false);
      setIsUsingLLM(false);
    }
  };

  const handleCopy = async () => {
    if (replaceText) {
      try {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = replaceText;
        const plainText = tempDiv.textContent || tempDiv.innerText || "";

        const clipboardItem = new ClipboardItem({
          "text/html": new Blob([replaceText], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        });

        await navigator.clipboard.write([clipboardItem]);
      } catch (error) {
        console.warn("Rich text copy failed, falling back to plain text:", error);
        await navigator.clipboard.writeText(replaceText);
      }
    }
  };

  const handleDebug = async () => {
    const debugInfo = {
      toolState: tool.state,
      toolInput: tool.input,
      toolOutput: tool.output,
      toolError: tool.errorText,
      selectionLength: selectionWithEllipsis.length,
      replaceLength: replaceText.length,
      isInputStreaming,
      isCallStreaming,
      hasOutput,
      isApplied,
      isApplying,
      isUsingLLM,
      errorMessage,
      applyStatus,
      hasEditor: !!editor,
      hasTitleEditor: !!titleEditor,
      targetDocumentId,
      currentParamsId: params.id,
      pendingChange,
      pendingChangeStatus,
      timestamp: new Date().toISOString(),
    };

    console.group("🐛 Replace In Document Tool Debug Info");
    console.log("Tool object:", tool);
    console.log("Selection with ellipsis:", selectionWithEllipsis);
    console.log("Replace text:", replaceText);
    console.log("State flags:", {
      isInputStreaming,
      isCallStreaming,
      hasOutput,
      isApplied,
      isApplying,
      isUsingLLM,
    });
    console.log("Editors:", {
      hasEditor: !!editor,
      hasTitleEditor: !!titleEditor,
    });
    console.log("Error state:", {
      errorMessage,
      applyStatus,
    });
    console.log("Pending change:", {
      pendingChange,
      pendingChangeStatus,
    });
    console.log("Debug summary:", debugInfo);
    console.groupEnd();
  };

  const handleCreatePage = async () => {
    if (!replaceText) {
      return;
    }

    try {
      await createDocument(undefined, undefined, replaceText, newTitle);
    } catch (error) {
      console.error("Failed to create page:", error);
    }
  };

  const handlePreview = async () => {
    if (!editor || !replaceText) {
      setErrorMessage("Editor not available. Please wait for the document to load.");
      return;
    }

    const currentDocId = targetDocumentId || params.id;
    if (!currentDocId) {
      setErrorMessage("No document selected.");
      return;
    }

    // If we're already previewing this change, clear it
    if (isPreviewing) {
      editor.commands.clearProposedChange?.();
      setProposedChange(null);
      return;
    }

    // Clear any existing proposed change first
    if (proposedChange) {
      const existingEditor = registry.get(proposedChange.documentId)?.contentEditor;
      existingEditor?.commands.clearProposedChange?.();
    }

    // Find the range in the document
    const rangeResult = findChangeRange(editor, selectionWithEllipsis);

    if (!rangeResult.success) {
      setErrorMessage(rangeResult.error || "Could not find the text to replace in the document.");
      return;
    }

    // Show the proposed change in the editor
    if (editor.commands.showProposedChange) {
      editor.commands.showProposedChange(rangeResult.from, rangeResult.to, replaceText);

      // Store the proposed change state
      setProposedChange({
        documentId: currentDocId,
        toolCallId: tool.toolCallId,
        selectionWithEllipsis,
        replace: replaceText,
        title: newTitle,
        isPreviewing: true,
      });

      // Scroll to the change
      try {
        const dom = editor.view.dom as HTMLElement;
        const scrollContainer = dom.closest("[data-editor-scroll-container]") || dom.parentElement;
        if (scrollContainer) {
          const coords = editor.view.coordsAtPos(rangeResult.from);
          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeTop = coords.top - containerRect.top + scrollContainer.scrollTop;
          scrollContainer.scrollTo({
            top: Math.max(0, relativeTop - 100),
            behavior: "smooth",
          });
        }
      } catch {
        // Ignore scroll errors
      }
    } else {
      setErrorMessage("Diff preview is not available. Please apply the change directly.");
    }
  };

  // Listen for accept/reject from the editor extension
  useEffect(() => {
    if (!isPreviewing) return;

    // Check if the proposed change has been accepted or rejected
    const extension = editor?.extensionManager.extensions.find(
      (ext: any) => ext.name === "proposedChange",
    );

    if (extension && !extension.storage.isActive) {
      // The change was either accepted or rejected
      setIsApplied(true);
      setProposedChange(null);
    }
  }, [editor, isPreviewing, setProposedChange]);

  const isError = tool.state === "output-error";
  const roundedWordCount = Math.floor(wordCount / 10) * 10;

  const getStatusText = () => {
    if (isError) return "Failed to modify document";
    if (isApplied) return "Changes applied";
    if (isApplying) return "Applying changes";
    if (isInputStreaming) return "Generating content";
    if (isFullReplacement) return "Replace entire document";
    return "Modify document";
  };

  return (
    <motion.div className={`p-1 bg-gray-100 rounded-[10px] my-4 relative ${className}`}>
      <div className="p-1">
        <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
          {isInputStreaming && (
            <ArrowClockwiseRegular className="size-3 animate-spin text-blue-500" />
          )}
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
            <DocumentIcon className="size-3" />
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
              {errorMessage && (
                <motion.div
                  className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5 mb-2 flex items-start justify-between gap-2"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <span className="flex-1">{errorMessage}</span>
                  <AriaButton
                    onPress={() => setErrorMessage("")}
                    className="text-red-600 hover:text-red-700 shrink-0"
                  >
                    Dismiss
                  </AriaButton>
                </motion.div>
              )}
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
                {replaceText && (
                  <Button
                    intent="secondary"
                    size="xs"
                    onPress={handleCreatePage}
                    isDisabled={isInputStreaming}
                  >
                    Create page with content
                  </Button>
                )}
                {replaceText && !isFullReplacement && (
                  <Button
                    intent="secondary"
                    size="xs"
                    onPress={handlePreview}
                    isDisabled={isApplied || isApplying || isInputStreaming || !editor}
                  >
                    {isPreviewing ? "Hide Preview" : "Preview"}
                  </Button>
                )}
                <Button
                  intent="secondary"
                  size="xs"
                  onPress={handleApply}
                  isDisabled={isApplied || isApplying || isInputStreaming}
                  isPending={isApplying || isUsingLLM}
                >
                  {isApplying
                    ? applyStatus || "Applying..."
                    : isApplied
                      ? "Applied"
                      : errorMessage
                        ? "Retry"
                        : "Apply"}
                </Button>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
