import { useState, useRef, useLayoutEffect } from "react";
import { Button } from "react-aria-components";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ToolContainer, type ToolAction } from "./ToolContainer";
import { countWords } from "@/utils/text";
import { useAuth } from "@/context/auth.context";
import { isAdmin } from "@/utils/admin";
import { applyContentChanges } from "@/utils/document-changes";
import type { Editor } from "@tiptap/react";

export interface ReplaceInDocumentToolProps {
  tool: {
    state:
      | "input-streaming"
      | "input-available"
      | "call-streaming"
      | "output-available"
      | "output-error";
    input?: {
      search?: string;
      replace?: string;
      overwrite?: boolean;
    };
    output?: {
      search?: string;
      replace?: string;
      overwrite?: boolean;
    };
    errorText?: string;
  };
  editor: Editor | null;
  organizationId: string;
  className?: string;
}

export function ReplaceInDocumentTool({
  tool,
  editor,
  organizationId,
  className = "",
}: ReplaceInDocumentToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isUsingLLM, setIsUsingLLM] = useState(false);
  const [applyStatus, setApplyStatus] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();

  // Get replace text from input (streaming) or output (completed)
  const replaceText = tool.input?.replace || tool.output?.replace || "";
  const isStreaming = tool.state === "input-streaming";

  // Get search and overwrite from input or output
  const searchText = tool.input?.search || tool.output?.search || "";
  const isOverwrite = tool.input?.overwrite ?? tool.output?.overwrite ?? false;

  useLayoutEffect(() => {
    if (contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight;
      setHasOverflow(contentHeight > 140);
    }
  }, [replaceText]);

  // Don't render until we have some content (streaming or complete)
  if (!replaceText && tool.state !== "input-streaming") {
    return null;
  }

  const wordCount = countWords(replaceText);

  const handleApply = async () => {
    if (!replaceText || !editor) {
      return;
    }

    setIsApplying(true);
    setApplyStatus("Applying...");

    try {
      const result = await applyContentChanges(
        editor,
        [
          {
            search: searchText,
            replace: replaceText,
            overwrite: isOverwrite,
          },
        ],
        organizationId,
        undefined, // onProgress
        (isUsingLLM) => {
          setIsUsingLLM(isUsingLLM);
        }
      );

      if (result.success) {
        setIsApplied(true);
        setApplyStatus("");
        if (result.usedLLMFallback) {
          console.info("✨ LLM-assisted replacement was used for this change");
        }
      } else {
        setApplyStatus("Failed to apply");
        console.error("Failed to apply changes:", result.error);
      }
    } catch (error) {
      console.error("Failed to apply:", error);
      setApplyStatus("Failed to apply");
    } finally {
      setIsApplying(false);
      setIsUsingLLM(false);
    }
  };

  const handleCopy = async () => {
    if (replaceText) {
      await navigator.clipboard.writeText(replaceText);
    }
  };

  const handleDebug = async () => {
    const debugInfo = {
      toolState: tool.state,
      toolInput: tool.input,
      toolOutput: tool.output,
      toolError: tool.errorText,
      searchLength: searchText.length,
      replaceLength: replaceText.length,
      isStreaming,
      timestamp: new Date().toISOString(),
    };

    console.group("🐛 Replace In Document Tool Debug Info");
    console.log("Tool object:", tool);
    console.log("Search text:", searchText);
    console.log("Replace text:", replaceText);
    console.log("Is streaming:", isStreaming);
    console.log("Debug summary:", debugInfo);
    console.groupEnd();
  };

  // Show error state
  if (tool.state === "output-error") {
    return (
      <ToolContainer title="Document modification error" className={className}>
        <div className="text-red-600 text-sm">
          Error: {tool.errorText || "Unknown error occurred"}
        </div>
      </ToolContainer>
    );
  }

  // Show input available or output available states
  const actions: ToolAction[] = [
    {
      label: "Copy",
      onPress: handleCopy,
      intent: "secondary",
      disabled: isApplying || isStreaming,
    },
    {
      label: isApplying
        ? applyStatus || "Applying..."
        : isApplied
        ? "Applied"
        : "Apply",
      onPress: handleApply,
      intent: "primary",
      disabled: isApplied || isApplying || isStreaming || !editor,
      pending: isApplying || isUsingLLM,
    },
  ];

  if (isAdmin(user)) {
    actions.unshift({
      label: "Debug",
      onPress: handleDebug,
      intent: "secondary",
    });
  }

  const title = isStreaming
    ? `Generating content...${wordCount > 0 ? ` | ${wordCount} words` : ""}`
    : isOverwrite
    ? `Overwrite document | ${wordCount} words`
    : `Modify document | ${wordCount} words`;

  return (
    <ToolContainer title={title} actions={actions} className={className}>
      {replaceText && (
        <div
          className="overflow-hidden relative"
          style={{
            height: isExpanded || !hasOverflow ? "auto" : 140,
          }}
        >
          <div
            ref={contentRef}
            className="editor-content-sm"
            dangerouslySetInnerHTML={{ __html: replaceText }}
          />
          {!isExpanded && hasOverflow && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-white to-transparent pointer-events-none" />
          )}
        </div>
      )}
      {isStreaming && (
        <div className="flex items-center gap-2 pt-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
            ))}
          </div>
          <span className="text-xs text-gray-500">Streaming content...</span>
        </div>
      )}
      {hasOverflow && (
        <Button
          onPress={() => setIsExpanded(!isExpanded)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 w-full justify-center"
        >
          {isExpanded ? (
            <div className="flex items-center gap-1">
              <ChevronUp className="size-3" />
              <span>Show less</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <ChevronDown className="size-3" />
              <span>Show more</span>
            </div>
          )}
        </Button>
      )}
    </ToolContainer>
  );
}
