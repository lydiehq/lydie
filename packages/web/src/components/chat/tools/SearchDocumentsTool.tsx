import { useState } from "react";
import { Disclosure, DisclosurePanel, Button } from "react-aria-components";
import { Loader, FileText, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ToolContainer } from "./ToolContainer";

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

  // Show loading state
  if (isToolLoading) {
    return (
      <ToolContainer
        title={tool.output?.message || "Searching documents..."}
        className={className}
      >
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader className="size-4 animate-spin" />
          <span>Processing...</span>
        </div>
      </ToolContainer>
    );
  }

  // Only proceed if we have output available
  if (tool.state !== "output-available") {
    return null;
  }

  // No results found
  if (!hasResults) {
    return (
      <ToolContainer title="Search complete" className={className}>
        <div className="text-gray-500 text-sm">
          No relevant documents found for "{query}"
        </div>
      </ToolContainer>
    );
  }

  return (
    <ToolContainer
      title={`Found ${results.length} relevant document${
        results.length === 1 ? "" : "s"
      }`}
      className={className}
    >
      <Disclosure
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        className="group w-full flex flex-col"
      >
        <Button
          className="group flex items-center gap-x-2 truncate relative text-gray-500 hover:text-gray-700"
          slot="trigger"
        >
          <FileText className="size-3 group-hover:opacity-0 transition-opacity duration-200" />
          <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 group-expanded:rotate-90 transition-all duration-200 absolute" />
          <span className="text-[13px]">
            {isExpanded ? "Hide" : "Show"} documents
          </span>
        </Button>
        <DisclosurePanel className="overflow-hidden pl-5">
          <ul className="overflow-hidden flex flex-col gap-y-1 pt-2">
            {results.map((result) => (
              <li
                key={result.documentId}
                className="text-gray-500 text-[13px] hover:underline hover:text-gray-900 truncate"
              >
                <Link
                  to="/w/$organizationid/$id"
                  from="/w/$organizationId"
                  params={{ id: result.documentId }}
                >
                  {result.documentTitle}
                </Link>
              </li>
            ))}
          </ul>
        </DisclosurePanel>
      </Disclosure>
    </ToolContainer>
  );
}
