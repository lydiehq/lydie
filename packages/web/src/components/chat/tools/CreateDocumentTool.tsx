import { FileText, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";

interface CreateDocumentToolProps {
  tool: {
    toolCallId: string;
    input?: {
      title?: string;
      content?: string;
    };
    output?: {
      id: string;
      title: string;
      snippet?: string;
    };
  };
  organizationId: string;
}

export function CreateDocumentTool({
  tool,
  organizationId,
}: CreateDocumentToolProps) {
  const { output, input } = tool;
  const title = output?.title || input?.title || "Untitled Document";
  const snippet = output?.snippet || input?.content || "";

  // Strip HTML from snippet for preview
  const plainSnippet = snippet
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150)
    .concat(snippet.length > 150 ? "..." : "");

  const isCreating = !output?.id;

  return (
    <motion.div className="p-1 bg-gray-100 rounded-[10px] my-2">
      <div className="p-1">
        <motion.div
          key={isCreating ? "creating" : "created"}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
          }}
          className="text-[11px] text-gray-700"
        >
          {isCreating ? "Creating document..." : "Document created"}
        </motion.div>
      </div>

      <motion.div
        layout="size"
        className="bg-white rounded-lg ring ring-black/2 shadow-surface p-0.5 overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {isCreating ? (
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

              {plainSnippet && (
                <div className="p-2 text-xs text-gray-600 bg-gray-50 rounded mb-2">
                  {plainSnippet}
                </div>
              )}

              {output?.id && (
                <div className="flex justify-end">
                  <Link
                    to="/w/$organizationSlug/$id"
                    params={{ organizationId, id: output.id }}
                    className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    Open Document
                    <ExternalLink size={12} />
                  </Link>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
