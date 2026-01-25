import { ArrowClockwiseRegular, CheckmarkRegular } from "@fluentui/react-icons";
import React from "react";

export interface ReadCurrentDocumentToolProps {
  tool: {
    state:
      | "input-streaming"
      | "input-available"
      | "call-streaming"
      | "output-available"
      | "output-error";
    args?: Record<string, never>;
    output?: {
      message?: string;
      state?: "reading" | "processing" | "success" | "error";
      documentTitle?: string;
      title?: string;
      content?: string;
      error?: string;
    };
  };
  className?: string;
}

export function ReadCurrentDocumentTool({ tool }: ReadCurrentDocumentToolProps) {
  const outputState = tool.output?.state;
  const isToolLoading =
    tool.state === "call-streaming" ||
    (outputState && outputState !== "success" && outputState !== "error");

  // Determine loading message
  let loadingMessage = "Reading current document";
  const documentTitle = tool.output?.documentTitle || tool.output?.title;

  if (outputState === "reading") {
    loadingMessage = "Reading current document";
  } else if (outputState === "processing") {
    loadingMessage = documentTitle
      ? `Processing document "${documentTitle}"`
      : "Processing current document";
  } else if (documentTitle) {
    loadingMessage = `Reading current document "${documentTitle}"`;
  }

  // Determine content to display
  let content: React.ReactNode = null;

  if (isToolLoading) {
    content = (
      <div className="flex items-center gap-x-2 text-gray-500 truncate">
        <ArrowClockwiseRegular className="size-3 animate-spin" />
        <span className="text-[13px] whitespace-nowrap">{loadingMessage}...</span>
      </div>
    );
  } else if (outputState === "error" || tool.output?.error) {
    content = (
      <div className="text-red-600 text-sm">
        <p className="font-medium">Error reading document:</p>
        <p className="text-xs mt-1 text-red-500">{tool.output?.error}</p>
      </div>
    );
  } else if (outputState === "success" && tool.output?.title) {
    content = (
      <div className="flex items-center gap-x-1 truncate text-gray-500">
        <CheckmarkRegular className="size-2.5" />
        <span className="text-[13px] whitespace-nowrap">
          Read current document: "{tool.output.title}"
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
