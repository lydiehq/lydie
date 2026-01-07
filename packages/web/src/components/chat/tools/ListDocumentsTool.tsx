import { Disclosure, DisclosurePanel, Button } from "react-aria-components";
import {
  Loader,
  List,
  ExternalLink,
  Calendar,
  Clock,
  File,
} from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ToolContainer } from "./ToolContainer";
import { motion } from "motion/react";

export interface ListDocumentsToolProps {
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
        contentPreview?: string;
        contentLength?: number;
      }>;
      totalFound?: number;
      filters?: {
        titleFilter?: string;
        sortBy: string;
        sortOrder: string;
        limit: number;
      };
    };
  };
  className?: string;
}

export function ListDocumentsTool({
  tool,
  className = "",
}: ListDocumentsToolProps) {
  const isLoading =
    tool.state === "input-streaming" || tool.state === "call-streaming";
  const hasOutput = tool.state === "output-available";
  const documents = tool.output?.documents || [];
  const filters = tool.output?.filters;
  const preliminaryState = tool.output?.state;

  if (isLoading) {
    let message = "Listing documents";
    const titleFilter = tool.args?.titleFilter;

    if (preliminaryState === "loading") {
      message = titleFilter
        ? `Searching for documents matching "${titleFilter}"`
        : "Loading documents";
    } else if (titleFilter) {
      message = `Listing documents matching "${titleFilter}"`;
    }

    return (
      <div className={`flex items-center gap-x-2 text-gray-500 ${className}`}>
        <Loader className="size-3 animate-spin" />
        <span className="text-[13px]">{message}...</span>
      </div>
    );
  }

  if (!hasOutput) {
    return null;
  }

  return (
    <div className="p-1 bg-gray-100 rounded-lg my-2">
      <div className="p-1">
        <motion.div
          key={documents.length > 0 ? "found" : "loading"}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
          }}
          className="text-[11px] text-gray-700"
        >
          {documents.length > 0
            ? `Found ${documents.length} document${
                documents.length !== 1 ? "s" : ""
              }`
            : "Loading documents..."}
        </motion.div>
      </div>
      <motion.div
        className="bg-white rounded-lg ring ring-black/2 shadow-surface p-0.5"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: {
              staggerChildren: 0.05,
            },
          },
        }}
      >
        {documents.map((doc) => (
          <motion.div
            key={doc.id}
            variants={{
              hidden: { opacity: 0, y: -10 },
              visible: {
                opacity: 1,
                y: 0,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                },
              },
            }}
          >
            <Link
              to="/w/$organizationSlug/$id"
              from="/w/$organizationSlug"
              params={{ id: doc.id }}
              className="group flex items-center gap-x-1.5 py-1 rounded-md text-sm font-medium px-2 mb-0.5 text-gray-600 hover:bg-black/3 transition-colors duration-75"
            >
              <File className="text-gray-500 shrink-0 size-3.5" />
              <span className="truncate flex-1">
                {doc.title || "Untitled document"}
              </span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );

  return (
    <Disclosure className={`group w-full flex flex-col ${className}`}>
      <Button
        className="group flex items-center gap-x-2 truncate relative text-gray-500 hover:text-gray-700"
        slot="trigger"
      >
        <List className="size-3 group-hover:opacity-0 transition-opacity duration-200" />
        <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 group-expanded:rotate-90 transition-all duration-200 absolute" />
        <span className="text-[13px]">
          Listed {documents.length} document{documents.length !== 1 ? "s" : ""}
          {filters?.titleFilter && ` matching "${filters.titleFilter}"`}
        </span>
      </Button>
      <DisclosurePanel className="overflow-hidden pl-5">
        <div className="pt-2">
          <ToolContainer title={`Documents (${documents.length})`}>
            <div className="space-y-3">
              {/* Filter/Sort Info */}
              {filters && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-md p-2">
                  <div className="flex items-center gap-4">
                    <span>
                      Sort: {filters.sortBy} ({filters.sortOrder})
                    </span>
                    <span>Limit: {filters.limit}</span>
                    {filters.titleFilter && (
                      <span>Filter: "{filters.titleFilter}"</span>
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
                          <ExternalLink className="size-3 flex-shrink-0" />
                        </Link>
                        <div className="text-xs text-gray-500 mt-1">
                          /{doc.slug}
                        </div>
                      </div>

                      <div className="text-xs text-gray-400 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3" />
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
                        <Calendar className="size-3" />
                        Created: {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {documents.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  <p className="text-sm">No documents found</p>
                  {filters?.titleFilter && (
                    <p className="text-xs mt-1">
                      Try adjusting your search filter
                    </p>
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
