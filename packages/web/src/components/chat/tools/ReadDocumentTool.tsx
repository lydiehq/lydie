import React from "react";
import { Check, Loader } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface ReadDocumentToolProps {
  tool: {
    state:
      | "input-streaming"
      | "input-available"
      | "call-streaming"
      | "output-available"
      | "output-error";
    args?: {
      documentId?: string;
      documentTitle?: string;
      includeMetadata?: boolean;
    };
    output?: {
      message?: string;
      state?: "searching" | "reading" | "success" | "error";
      documentTitle?: string;
      document?: {
        id: string;
        title: string;
        content: string;
        slug?: string;
        createdAt?: string;
        updatedAt?: string;
      };
      error?: string;
    };
  };
  className?: string;
}

export function ReadDocumentTool({
  tool,
  className = "",
}: ReadDocumentToolProps) {
  const outputState = tool.output?.state;
  const isToolLoading =
    tool.state === "call-streaming" ||
    (outputState && outputState !== "success" && outputState !== "error");

  // Determine loading message
  let loadingMessage = "Reading document";
  const documentTitle = tool.output?.documentTitle || tool.args?.documentTitle;

  if (outputState === "searching") {
    loadingMessage = documentTitle
      ? `Searching for document "${documentTitle}"`
      : "Searching for document";
  } else if (outputState === "reading") {
    loadingMessage = documentTitle
      ? `Reading document "${documentTitle}"`
      : "Reading document";
  } else if (documentTitle) {
    loadingMessage = `Reading document "${documentTitle}"`;
  }

  // Don't render if no meaningful state
  if (
    tool.state !== "output-available" &&
    tool.state !== "call-streaming" &&
    !isToolLoading
  ) {
    return null;
  }

  const message = isToolLoading
    ? loadingMessage
    : outputState === "error" || tool.output?.error
    ? "Error reading document"
    : outputState === "success" && tool.output?.document
    ? `Read document: "${tool.output.document.title}"`
    : "Reading document";

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
              <Loader className="size-4 animate-spin text-gray-400" />
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
                <p className="font-medium text-[13px]">Error reading document:</p>
                <p className="text-xs mt-1 text-red-500">{tool.output?.error}</p>
              </div>
            </motion.div>
          ) : outputState === "success" && tool.output?.document ? (
            <motion.div
              key="success"
              className="flex items-center gap-x-1 px-2 py-2 text-gray-500"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Check className="size-3" />
              <span className="text-[13px]">
                Successfully read "{tool.output.document.title}"
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
