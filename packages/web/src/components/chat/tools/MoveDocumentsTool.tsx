import { ArrowClockwiseRegular, CheckmarkRegular } from "@fluentui/react-icons";
import { AnimatePresence, motion } from "motion/react";
import React from "react";

export interface MoveDocumentsToolProps {
  tool: {
    state:
      | "input-streaming"
      | "input-available"
      | "call-streaming"
      | "output-available"
      | "output-error";
    args?: {
      documentIds?: string[];
      parentId?: string | null;
      parentTitle?: string;
      moveAll?: boolean;
    };
    output?: {
      message?: string;
      state?: "moving" | "success" | "error";
      movedDocuments?: Array<{
        id: string;
        title: string;
        parentId: string | null;
      }>;
      totalMoved?: number;
      error?: string;
    };
  };
  className?: string;
}

export function MoveDocumentsTool({ tool, className = "" }: MoveDocumentsToolProps) {
  const outputState = tool.output?.state;
  const isToolLoading =
    tool.state === "call-streaming" ||
    (outputState && outputState !== "success" && outputState !== "error");

  // Determine loading message
  let loadingMessage = "Moving documents";
  if (outputState === "moving") {
    loadingMessage = tool.output?.message || "Moving documents";
  } else if (tool.args?.moveAll) {
    loadingMessage = "Moving all documents";
  } else if (tool.args?.documentIds && tool.args.documentIds.length > 0) {
    const count = tool.args.documentIds.length;
    loadingMessage = `Moving ${count} document${count === 1 ? "" : "s"}`;
  }

  // Don't render if no meaningful state
  if (tool.state !== "output-available" && tool.state !== "call-streaming" && !isToolLoading) {
    return null;
  }

  const message = isToolLoading
    ? loadingMessage
    : outputState === "error" || tool.output?.error
      ? "Error moving documents"
      : outputState === "success" && tool.output?.message
        ? tool.output.message
        : "Moving documents";

  const movedDocuments = tool.output?.movedDocuments || [];
  const totalMoved = tool.output?.totalMoved || movedDocuments.length;

  return (
    <motion.div className={`p-1 bg-gray-100 rounded-[10px] my-2 ${className}`}>
      <div className="p-1">
        <motion.div
          key={isToolLoading ? "loading" : outputState === "error" ? "error" : "success"}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
          }}
          className="text-[11px] text-gray-700"
        >
          {message}
        </motion.div>
      </div>

      <motion.div
        layout="size"
        className="bg-white rounded-lg ring ring-black/2 shadow-surface p-0.5 overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {isToolLoading ? (
            <motion.div
              key="spinner"
              className="flex items-center justify-center py-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ArrowClockwiseRegular className="size-4 animate-spin text-gray-400" />
            </motion.div>
          ) : outputState === "error" || tool.output?.error ? (
            <motion.div
              key="error"
              className="p-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="text-red-600 text-sm">
                <p className="font-medium text-[13px]">Error moving documents:</p>
                <p className="text-xs mt-1 text-red-500">{tool.output?.error}</p>
              </div>
            </motion.div>
          ) : outputState === "success" ? (
            <motion.div
              key="success"
              className="px-2 py-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="flex items-center gap-x-1 text-gray-500 mb-2">
                <CheckmarkRegular className="size-3" />
                <span className="text-[13px]">
                  Successfully moved {totalMoved} document
                  {totalMoved === 1 ? "" : "s"}
                </span>
              </div>
              {movedDocuments.length > 0 && movedDocuments.length <= 5 && (
                <motion.ul
                  className="space-y-1 mt-2"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: {
                        staggerChildren: 0.05,
                      },
                    },
                  }}
                >
                  {movedDocuments.map((doc) => (
                    <motion.li
                      key={doc.id}
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        visible: { opacity: 1, x: 0 },
                      }}
                      className="text-xs text-gray-600 pl-2"
                    >
                      • {doc.title || "Untitled document"}
                    </motion.li>
                  ))}
                </motion.ul>
              )}
              {movedDocuments.length > 5 && (
                <div className="text-xs text-gray-500 mt-2 pl-2">
                  ...and {movedDocuments.length - 5} more
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
