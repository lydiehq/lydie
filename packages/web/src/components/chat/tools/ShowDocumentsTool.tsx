import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";

import { DocumentIcon } from "@/components/icons/DocumentIcon";

export interface ShowDocumentsToolProps {
  tool: {
    state: string;
    args?: {
      limit?: number;
      sortBy?: "title" | "updated" | "created";
      sortOrder?: "asc" | "desc";
      titleFilter?: string;
    };
    output?: {
      state?: string;
      message?: string;
      documents?: Array<{
        id: string;
        title: string;
        slug: string;
        createdAt: string;
        updatedAt: string;
      }>;
      totalFound?: number;
    };
  };
  className?: string;
}

export function ShowDocumentsTool({ tool, className = "" }: ShowDocumentsToolProps) {
  const outputState = tool.output?.state;
  const isToolLoading =
    tool.state === "call-streaming" || (outputState && outputState !== "success");
  const documents = tool.output?.documents || [];

  let loadingMessage = "Loading documents...";
  if (outputState === "loading") {
    loadingMessage = tool.output?.message || "Loading documents...";
  }

  const message = isToolLoading
    ? loadingMessage
    : `Found ${documents.length} document${documents.length !== 1 ? "s" : ""}`;

  return (
    <motion.div className={`p-1 bg-gray-100 rounded-[10px] my-2 ${className}`}>
      <div className="p-1">
        <motion.div
          key={isToolLoading ? "loading" : outputState === "success" ? "success" : "found"}
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
          ) : outputState === "success" && documents.length > 0 ? (
            <motion.ul
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.5, delay: 0.5 }}
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: Math.max(
                      0.02,
                      Math.min(0.12, 0.12 - (documents.length - 1) * 0.01),
                    ),
                  },
                },
              }}
            >
              {documents.map((doc) => (
                <motion.div
                  key={doc.id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: {
                      opacity: 1,
                      y: 0,
                    },
                  }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  <Link
                    to="/w/$organizationSlug/$id"
                    from="/w/$organizationSlug"
                    params={{ id: doc.id }}
                    className="group flex items-center gap-x-1.5 py-1 rounded-md text-sm font-medium px-2 mb-0.5 text-gray-600 hover:bg-black/3 transition-colors duration-75"
                  >
                    <DocumentIcon className="text-gray-500 shrink-0 size-3.5" />
                    <span className="truncate flex-1">{doc.title || "Untitled document"}</span>
                  </Link>
                </motion.div>
              ))}
            </motion.ul>
          ) : outputState === "success" && documents.length === 0 ? (
            <motion.div
              key="empty"
              className="flex items-center justify-center py-3 text-gray-500"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <span className="text-[13px]">No documents found</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
