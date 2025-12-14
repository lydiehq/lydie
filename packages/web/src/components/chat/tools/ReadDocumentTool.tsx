import React from "react";
import { Check, Loader } from "lucide-react";
import { ToolContainer } from "./ToolContainer";

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

  // Determine content to display
  let content: React.ReactNode = null;

  if (isToolLoading) {
    content = (
      <div className="flex items-center gap-x-2 text-gray-500 truncate">
        <Loader className="size-3 animate-spin" />
        <span className="text-[13px] whitespace-nowrap">
          {loadingMessage}...
        </span>
      </div>
    );
  } else if (outputState === "error" || tool.output?.error) {
    content = (
      <div className="text-red-600 text-sm">
        <p className="font-medium">Error reading document:</p>
        <p className="text-xs mt-1 text-red-500">{tool.output?.error}</p>
      </div>
    );
  } else if (outputState === "success" && tool.output?.document) {
    content = (
      <div className="flex items-center gap-x-1 truncate text-gray-500">
        <Check className="size-2.5" />
        <span className="text-[13px] whitespace-nowrap">
          Read document: "{tool.output.document.title}"
        </span>
      </div>
    );
  }

  // Don't render if no content
  if (!content) {
    return null;
  }

  return <div className="my-2">{content}</div>;
}
