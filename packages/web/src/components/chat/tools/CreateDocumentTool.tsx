import { ExternalLink, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { countWords } from "@/utils/text";
import { useOrganization } from "@/context/organization.context";
import { StickToBottom } from "use-stick-to-bottom";
import { Button } from "@/components/generic/Button";

type Props = {
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
};

export function CreateDocumentTool({ tool }: Props) {
  const { organization } = useOrganization();
  const { output, input } = tool;

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
    <motion.div className="p-1 bg-gray-100 rounded-[10px] my-4 relative">
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
      <div className="relative">
        <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden absolute h-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2  w-[calc(100%-0rem)] z-0 -rotate-2 opacity-80" />
        <motion.div
          layout="size"
          className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden relative z-10"
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
                {/* <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {title}
                </span>
              </div> */}

                {hasContent && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{
                      opacity: 1,
                      height: "auto",
                    }}
                  >
                    <StickToBottom
                      className="text-xs text-gray-600 max-h-56 overflow-y-auto"
                      resize="smooth"
                      initial="instant"
                    >
                      <StickToBottom.Content>
                        <div
                          className="editor-content-sm"
                          dangerouslySetInnerHTML={{ __html: content }}
                        />
                      </StickToBottom.Content>
                    </StickToBottom>
                  </motion.div>
                )}
                {documentId && (
                  <div className="flex justify-end mt-2">
                    {organization.slug && (
                      <Button
                        intent="secondary"
                        size="xs"
                        to="/w/$organizationSlug/$id"
                        params={{
                          organizationSlug: organization.slug,
                          id: documentId,
                        }}
                      >
                        Open Document
                        <ExternalLink size={12} />
                      </Button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}
