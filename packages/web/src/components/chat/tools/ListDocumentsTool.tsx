import {
  ArrowClockwiseRegular,
  CalendarRegular,
  ChevronRightRegular,
  ClockRegular,
  ListRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Button, Disclosure, DisclosurePanel } from "react-aria-components";

import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";

import { ToolContainer } from "./ToolContainer";

export interface ListDocumentsToolProps {
  tool: {
    state: string;
    args?: {
      limit?: number;
      sortBy?: "title" | "updated" | "created";
      sortOrder?: "asc" | "desc";
      titleFilter?: string;
      createdAfter?: string;
      createdBefore?: string;
      minWords?: number;
      maxWords?: number;
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
        contentPreview?: string;
        contentLength?: number;
        wordCount?: number;
      }>;
      totalFound?: number;
      filters?: {
        titleFilter?: string | null;
        createdAfter?: string | null;
        createdBefore?: string | null;
        minWords?: number | null;
        maxWords?: number | null;
        sortBy: string;
        sortOrder: string;
        limit: number;
      };
    };
  };
  className?: string;
}

export function ListDocumentsTool({ tool, className = "" }: ListDocumentsToolProps) {
  const outputState = tool.output?.state;
  const isToolLoading =
    tool.state === "call-streaming" || (outputState && outputState !== "success");
  const documents = tool.output?.documents || [];
  const filters = tool.output?.filters;

  let loadingMessage = "Loading documents...";
  if (outputState === "loading") {
    loadingMessage = tool.output?.message || "Loading documents...";
  }

  const message = isToolLoading
    ? loadingMessage
    : `Found ${documents.length} document${documents.length !== 1 ? "s" : ""}`;

  return (
    <motion.div className="p-1 bg-gray-100 rounded-[10px] my-2">
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

  return (
    <Disclosure className={`group w-full flex flex-col ${className}`}>
      <Button
        className="group flex items-center gap-x-2 truncate relative text-gray-500 hover:text-gray-700"
        slot="trigger"
      >
        <ListRegular className="size-3 group-hover:opacity-0 transition-opacity duration-200" />
        <ChevronRightRegular className="size-3 opacity-0 group-hover:opacity-100 group-expanded:rotate-90 transition-all duration-200 absolute" />
        <span className="text-[13px]">
          Listed {documents.length} document{documents.length !== 1 ? "s" : ""}
          {filters && filters.titleFilter ? ` matching "${filters.titleFilter}"` : ""}
        </span>
      </Button>
      <DisclosurePanel className="overflow-hidden pl-5">
        <div className="pt-2">
          <ToolContainer title={`Documents (${documents.length})`}>
            <div className="space-y-3">
              {/* Filter/Sort Info */}
              {filters && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-md p-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      Sort: {filters?.sortBy} ({filters?.sortOrder})
                    </span>
                    <span>Limit: {filters?.limit}</span>
                    {filters?.titleFilter && <span>Title: "{filters?.titleFilter}"</span>}
                    {filters?.createdAfter && <span>Created after: {filters?.createdAfter}</span>}
                    {filters?.createdBefore && (
                      <span>Created before: {filters?.createdBefore}</span>
                    )}
                    {filters?.minWords !== null && filters?.minWords !== undefined && (
                      <span>Min words: {filters?.minWords}</span>
                    )}
                    {filters?.maxWords !== null && filters?.maxWords !== undefined && (
                      <span>Max words: {filters?.maxWords}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Documents List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="border border-gray-200 rounded-md p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link
                          to="/w/$organizationSlug/$id"
                          from="/w/$organizationSlug"
                          params={{ id: doc.id }}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 text-sm"
                        >
                          <span className="truncate">{doc.title}</span>
                          <OpenRegular className="size-3 shrink-0" />
                        </Link>
                        <div className="text-xs text-gray-500 mt-1">/{doc.slug}</div>
                      </div>

                      <div className="text-xs text-gray-400 shrink-0">
                        <div className="flex items-center gap-1">
                          <ClockRegular className="size-3" />
                          {new Date(doc.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {/* Content Preview */}
                    {doc.contentPreview && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-600 bg-gray-100 rounded p-2 max-h-16 overflow-hidden">
                          <div
                            className="line-clamp-2"
                            dangerouslySetInnerHTML={{
                              __html: doc.contentPreview,
                            }}
                          />
                        </div>
                        {doc.contentLength && (
                          <div className="text-xs text-gray-400 mt-1">
                            {doc.contentLength} characters
                          </div>
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <CalendarRegular className="size-3" />
                        Created: {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                      {doc.wordCount !== undefined && (
                        <div className="flex items-center gap-1">
                          <DocumentIcon className="size-3" />
                          {doc.wordCount} words
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {documents.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  <p className="text-sm">No documents found</p>
                  {filters?.titleFilter && (
                    <p className="text-xs mt-1">Try adjusting your search filter</p>
                  )}
                </div>
              )}
            </div>
          </ToolContainer>
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
}
