import { FileText, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useLayoutEffect } from "react";
import { countWords } from "@/utils/text";
import { useOrganization } from "@/context/organization.context";

interface CreateDocumentToolProps {
  tool: {
    toolCallId: string;
    state?:
      | "input-streaming"
      | "input-available"
      | "call-streaming"
      | "output-available"
      | "output-error";
    input?: {
      title?: string;
      content?: string;
    };
    output?: {
      state?:
        | "creating"
        | "created"
        | "applying-content"
        | "success"
        | "partial-success"
        | "error";
      message?: string;
      document?: {
        id: string;
        title: string;
        slug: string;
        parentId?: string | null;
      };
      contentApplied?: boolean;
      error?: string;
    };
  };
  organizationId: string; // Still passed for context compatibility
}

export function CreateDocumentTool({ tool }: CreateDocumentToolProps) {
  const { organization } = useOrganization();
  const { output, input } = tool;
  const [showContentPreview, setShowContentPreview] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const title = output?.document?.title || input?.title || "Untitled Document";
  const documentId = output?.document?.id;
  const content = input?.content || "";

  // Tool state tracking
  const isInputStreaming = tool.state === "input-streaming";
  const isCreated = !!documentId;
  const isError = output?.state === "error" || tool.state === "output-error";
  const isApplyingContent = output?.state === "applying-content";
  const isSuccess =
    output?.state === "success" || output?.state === "partial-success";

  // Content preview
  const hasContent = content.length > 0;
  const wordCount = countWords(content);

  // Strip HTML for plain text preview
  const plainContent = content
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  useLayoutEffect(() => {
    // Auto-show content preview if streaming and has significant content
    if (isInputStreaming && wordCount > 10) {
      setShowContentPreview(true);
    }
  }, [isInputStreaming, wordCount]);

  // Get status text
  const getStatusText = () => {
    if (isError) return "Failed to create document";
    if (isApplyingContent) return "Adding content...";
    if (isCreated && isSuccess) return "Document created";
    if (isCreated) return "Document created";
    if (isInputStreaming && hasContent)
      return `Generating content... | ${wordCount} words`;
    if (isInputStreaming) return "Preparing to create document...";
    return "Creating document...";
  };

  return (
    <motion.div className="p-1 bg-gray-100 rounded-[10px] my-2">
      <div className="p-1">
        <motion.div
          key={getStatusText()}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
          }}
          className="text-[11px] text-gray-700 flex items-center gap-1.5"
        >
          {(isInputStreaming || isApplyingContent) && (
            <Loader2 className="size-3 animate-spin text-blue-500" />
          )}
          {getStatusText()}
        </motion.div>
      </div>

      <motion.div
        layout="size"
        className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {isError ? (
            <motion.div
              key="error"
              className="p-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-red-600 text-sm">
                {output?.error ||
                  output?.message ||
                  "Failed to create document"}
              </div>
            </motion.div>
          ) : !isCreated && !hasContent ? (
            <motion.div
              key="creating"
              className="flex items-center justify-center py-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <div className="size-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <span>Creating...</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="created"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="p-2"
            >
              {/* Document header */}
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-gray-50 p-1.5 rounded border border-gray-200">
                  <FileText size={16} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {title}
                  </h3>
                </div>
              </div>

              {/* Content preview (while streaming or after) */}
              {hasContent && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{
                    opacity: showContentPreview ? 1 : 0,
                    height: showContentPreview ? "auto" : 0,
                  }}
                  className="mb-2"
                >
                  <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600">
                        Content Preview
                      </span>
                      <button
                        onClick={() =>
                          setShowContentPreview(!showContentPreview)
                        }
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        {showContentPreview ? "Hide" : "Show"}
                      </button>
                    </div>
                    <div
                      ref={contentRef}
                      className="text-xs text-gray-600 max-h-32 overflow-y-auto"
                      style={{
                        display: showContentPreview ? "block" : "none",
                      }}
                    >
                      <div
                        className="editor-content-sm"
                        dangerouslySetInnerHTML={{ __html: content }}
                      />
                    </div>
                    {!showContentPreview && (
                      <div className="text-xs text-gray-500 mt-1">
                        {plainContent}
                        {content.length > 200 && "..."}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Status message */}
              {output?.message && isSuccess && (
                <div className="p-2 text-xs text-gray-600 bg-blue-50 rounded mb-2">
                  {output.message}
                </div>
              )}

              {/* Partial success warning */}
              {output?.state === "partial-success" && (
                <div className="p-2 text-xs text-amber-700 bg-amber-50 rounded mb-2 border border-amber-200">
                  Document created but content failed to apply. You can add
                  content manually.
                </div>
              )}

              {/* Actions */}
              {documentId && (
                <div className="flex justify-end gap-2">
                  {hasContent && !showContentPreview && (
                    <button
                      onClick={() => setShowContentPreview(true)}
                      className="text-xs text-gray-600 hover:text-gray-700 font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      Show Content
                    </button>
                  )}
                  {organization.slug && (
                    <Link
                      to="/w/$organizationSlug/$id"
                      params={{
                        organizationSlug: organization.slug,
                        id: documentId,
                      }}
                      className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      Open Document
                      <ExternalLink size={12} />
                    </Link>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
