import {
  ArrowClockwiseRegular,
  CheckmarkRegular,
  ChevronRightRegular,
  ErrorCircleRegular,
  GlobeRegular,
  ListRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { DocumentIcon } from "@/components/editor/icons/DocumentIcon";

export interface ResearchAction {
  type: "read" | "search" | "list" | "web_search" | "search_in_document";
  label: string;
  status: "loading" | "success" | "error";
  toolPart: any;
}

export interface ResearchGroupProps {
  actions: ResearchAction[];
  isLoading: boolean;
}

function getActionIcon(type: ResearchAction["type"]) {
  switch (type) {
    case "read":
      return DocumentIcon;
    case "search":
    case "search_in_document":
      return SearchRegular;
    case "web_search":
      return GlobeRegular;
    case "list":
      return ListRegular;
    default:
      return DocumentIcon;
  }
}

function getActionVerb(type: ResearchAction["type"]) {
  switch (type) {
    case "read":
      return "Read";
    case "search":
      return "Searched";
    case "search_in_document":
      return "Searched in";
    case "web_search":
      return "Web search";
    case "list":
      return "Listed";
    default:
      return "Accessed";
  }
}

function buildSummaryLabel(actions: ResearchAction[]): string {
  const documents = actions.filter((a) => a.type === "read").length;
  const searches = actions.filter(
    (a) => a.type === "search" || a.type === "search_in_document",
  ).length;
  const webSearches = actions.filter((a) => a.type === "web_search").length;
  const lists = actions.filter((a) => a.type === "list").length;

  const parts: string[] = [];

  if (documents > 0) {
    parts.push(`${documents} document${documents !== 1 ? "s" : ""}`);
  }
  if (searches > 0) {
    parts.push(`${searches} search${searches !== 1 ? "es" : ""}`);
  }
  if (webSearches > 0) {
    parts.push(`${webSearches} web search${webSearches !== 1 ? "es" : ""}`);
  }
  if (lists > 0) {
    parts.push(`${lists} list${lists !== 1 ? "s" : ""}`);
  }

  if (parts.length === 0) {
    return "Explored";
  }

  return `Explored ${parts.join(" ")}`;
}

export function ResearchGroup({ actions, isLoading }: ResearchGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const summaryLabel = buildSummaryLabel(actions);
  const allSucceeded = actions.every((a) => a.status === "success");
  const hasErrors = actions.some((a) => a.status === "error");

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-x-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors group w-full text-left"
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center"
        >
          <ChevronRightRegular className="size-3" />
        </motion.span>

        {isLoading ? (
          <ArrowClockwiseRegular className="size-3 animate-spin text-gray-400" />
        ) : hasErrors ? (
          <ErrorCircleRegular className="size-3 text-red-500" />
        ) : allSucceeded ? (
          <CheckmarkRegular className="size-3 text-green-600" />
        ) : null}

        <span className="text-[13px]">{summaryLabel}</span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <ul className="pl-5 pt-1 space-y-0.5">
              {actions.map((action, index) => {
                const Icon = getActionIcon(action.type);
                const verb = getActionVerb(action.type);

                return (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-x-1.5 text-[13px] text-gray-500"
                  >
                    {action.status === "loading" ? (
                      <ArrowClockwiseRegular className="size-3 animate-spin text-gray-400 shrink-0" />
                    ) : action.status === "error" ? (
                      <ErrorCircleRegular className="size-3 text-red-500 shrink-0" />
                    ) : (
                      <Icon className="size-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {verb} {action.label}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Extracts a human-readable label from a tool part for display in the research group.
export function extractActionFromToolPart(part: any): ResearchAction | null {
  const toolType = part.type?.replace("tool-", "");

  switch (toolType) {
    case "read_document":
    case "read_current_document": {
      const title =
        part.output?.document?.title ||
        part.output?.documentTitle ||
        part.args?.documentTitle ||
        "current document";
      const status = getToolStatus(part);
      return { type: "read", label: `"${title}"`, status, toolPart: part };
    }

    case "search_documents": {
      const query = part.output?.searchQuery || part.args?.query || "documents";
      const status = getToolStatus(part);
      return { type: "search", label: `"${query}"`, status, toolPart: part };
    }

    case "search_in_document": {
      const query = part.output?.searchQuery || part.args?.query || "content";
      const status = getToolStatus(part);
      return {
        type: "search_in_document",
        label: `"${query}"`,
        status,
        toolPart: part,
      };
    }

    case "list_documents": {
      const count = part.output?.documents?.length;
      const label = count !== undefined ? `${count} documents` : "documents";
      const status = getToolStatus(part);
      return { type: "list", label, status, toolPart: part };
    }

    case "web_search": {
      const query = part.args?.query || part.output?.query || "the web";
      const status = getToolStatus(part);
      return {
        type: "web_search",
        label: `"${query}"`,
        status,
        toolPart: part,
      };
    }

    default:
      return null;
  }
}

function getToolStatus(part: any): ResearchAction["status"] {
  if (part.state === "call-streaming" || part.state === "input-streaming") {
    return "loading";
  }
  if (part.state === "output-error" || part.output?.state === "error" || part.output?.error) {
    return "error";
  }
  if (
    part.state === "output-available" &&
    (part.output?.state === "success" || !part.output?.error)
  ) {
    return "success";
  }
  return "loading";
}

// Checks if a tool part is a research tool (should be grouped/collapsed).
export function isResearchTool(part: any): boolean {
  const researchToolTypes = [
    "tool-read_document",
    "tool-read_current_document",
    "tool-search_documents",
    "tool-search_in_document",
    "tool-list_documents",
    "tool-web_search",
  ];
  return researchToolTypes.includes(part.type);
}

export type GroupedPart = { type: "research-group"; parts: any[] } | { type: "single"; part: any };

// Groups consecutive research tool parts together.
// Non-research parts and text parts break the grouping.
export function groupMessageParts(parts: any[]): GroupedPart[] {
  const groups: GroupedPart[] = [];
  let currentResearchGroup: any[] = [];

  for (const part of parts) {
    if (isResearchTool(part)) {
      currentResearchGroup.push(part);
    } else {
      // Flush research group if any
      if (currentResearchGroup.length > 0) {
        groups.push({ type: "research-group", parts: currentResearchGroup });
        currentResearchGroup = [];
      }
      groups.push({ type: "single", part });
    }
  }

  // Flush remaining research group
  if (currentResearchGroup.length > 0) {
    groups.push({ type: "research-group", parts: currentResearchGroup });
  }

  return groups;
}
