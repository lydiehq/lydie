import { useState } from "react";
import { Disclosure, DisclosurePanel, Button } from "react-aria-components";
import { Loader, FileText, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";

export interface SearchDocumentsToolProps {
  tool: {
    state: string;
    args?: {
      query?: string;
    };
    output?: {
      state?: string;
      message?: string;
      searchQuery?: string;
      totalFound?: number;
      results?: Array<{
        documentId: string;
        documentTitle: string;
        documentSlug?: string;
        searchType?: string;
      }>;
    };
  };
  className?: string;
}

export function SearchDocumentsTool({
  tool,
  className = "",
}: SearchDocumentsToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isToolLoading =
    tool.state === "call-streaming" || tool.output?.state === "searching";

  const query = tool.output?.searchQuery || tool.args?.query;
  const results = tool.output?.results || [];
  const hasResults = results.length > 0;

  // Only proceed if we have output available or are loading
  if (tool.state !== "output-available" && !isToolLoading) {
    return null;
  }

  const message = isToolLoading
    ? tool.output?.message || "Searching documents..."
    : hasResults
    ? `Found ${results.length} relevant document${
        results.length === 1 ? "" : "s"
      }`
    : `No relevant documents found for "${query}"`;

  return (
    <motion.div className={`p-1 bg-gray-100 rounded-[10px] my-2 ${className}`}>
      <div className="p-1">
        <motion.div
          key={isToolLoading ? "loading" : hasResults ? "found" : "none"}
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
          ) : !hasResults ? (
            <motion.div
              key="no-results"
              className="py-2 px-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-gray-500 text-[13px]">
                No documents found matching "{query}"
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Disclosure
                isExpanded={isExpanded}
                onExpandedChange={setIsExpanded}
                className="group w-full flex flex-col"
              >
                <Button
                  className="group flex items-center gap-x-2 truncate relative text-gray-500 hover:text-gray-700 px-2 py-1"
                  slot="trigger"
                >
                  <FileText className="size-3 group-hover:opacity-0 transition-opacity duration-200" />
                  <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 group-expanded:rotate-90 transition-all duration-200 absolute" />
                  <span className="text-[13px]">
                    {isExpanded ? "Hide" : "Show"} documents
                  </span>
                </Button>
                <DisclosurePanel className="overflow-hidden pl-5">
                  <motion.ul
                    initial="hidden"
                    animate="visible"
                    transition={{ duration: 0.5 }}
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.1,
                        },
                      },
                    }}
                    className="overflow-hidden flex flex-col gap-y-1 pt-2"
                  >
                    {results.map((result) => (
                      <motion.li
                        key={result.documentId}
                        variants={{
                          hidden: { opacity: 0, y: 10 },
                          visible: {
                            opacity: 1,
                            y: 0,
                          },
                        }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="text-gray-500 text-[13px] hover:underline hover:text-gray-900 truncate"
                      >
                        <Link
                          to="/w/$organizationSlug/$id"
                          from="/w/$organizationSlug"
                          params={{ id: result.documentId }}
                        >
                          {result.documentTitle}
                        </Link>
                      </motion.li>
                    ))}
                  </motion.ul>
                </DisclosurePanel>
              </Disclosure>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
