import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index";

import { MoreVerticalRegular } from "@fluentui/react-icons";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { memo, useMemo } from "react";
import { Button, DialogTrigger } from "react-aria-components";
import { Streamdown } from "streamdown";
import { StickToBottom } from "use-stick-to-bottom";

import { useOrganization } from "@/context/organization.context";
import { type ParsedTextSegment, parseReferences } from "@/utils/parse-references";

import { ReasoningParts } from "./Reasoning";
import { streamdownHeadings } from "./streamdown/headings";
import { CreateDocumentTool } from "./tools/CreateDocumentTool";
import { MoveDocumentsTool } from "./tools/MoveDocumentsTool";
import { ReplaceInDocumentTool } from "./tools/ReplaceInDocumentTool";
import { ResearchGroup, extractActionFromToolPart, groupMessageParts } from "./tools/ResearchGroup";
import { ShowDocumentsTool } from "./tools/ShowDocumentsTool";

type Props = {
  messages: DocumentChatAgentUIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  organizationId: string;
  onApplyContent?: (
    edits: any,
    onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  ) => void;
};

export function ChatMessages({ messages, status, organizationId, onApplyContent }: Props) {
  const lastMessage = messages[messages.length - 1];
  const isSubmitting =
    status === "submitted" && messages.length > 0 && lastMessage?.role === "user";

  const hasReasoningContent = lastMessage?.parts?.some(
    (part: any) => part.type === "reasoning" && part.text?.trim(),
  );

  const shouldShowLoading =
    isSubmitting ||
    (status === "streaming" &&
      lastMessage?.role === "assistant" &&
      !hasReasoningContent &&
      !lastMessage.parts?.some((part: any) => part.type === "text" && part.text?.trim()));

  return (
    <StickToBottom
      className="flex-1 overflow-hidden scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-300 scrollbar-track-gray-50"
      resize="smooth"
      initial={{ damping: 1, stiffness: 1 }}
    >
      <StickToBottom.Content className="flex flex-col gap-y-4 p-3">
        {messages.map((message, index) => (
          <div key={message.id}>
            {message.role === "user" ? (
              <UserMessage message={message} />
            ) : (
              <AssistantMessageWithTools
                message={message}
                onApplyContent={onApplyContent}
                status={status}
                isLastMessage={index === messages.length - 1}
                organizationId={organizationId}
              />
            )}
          </div>
        ))}
        {shouldShowLoading && <ThinkingIndicator />}
      </StickToBottom.Content>
    </StickToBottom>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-x-2 text-gray-600 text-sm">
      <ThinkingAnimation />
      <span>Thinking</span>
    </div>
  );
}

const AssistantMessageWithTools = memo(function AssistantMessageWithTools({
  message,
  onApplyContent,
  status,
  isLastMessage,
  organizationId,
}: {
  message: DocumentChatAgentUIMessage;
  onApplyContent?: (
    edits: any,
    onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  ) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  isLastMessage: boolean;
  organizationId: string;
}) {
  const formatDuration = (duration?: number) => {
    if (!duration) return "";
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const replaceTools = message.parts.filter(
    (part: any) => part.type === "tool-replace_in_document" && (part.input || part.output),
  );

  const shouldShowMetadata = status === "ready" || !isLastMessage;

  const handleApplyAll = async () => {
    if (!onApplyContent || replaceTools.length === 0) {
      return;
    }

    const allChanges = replaceTools
      .map((tool: any) => {
        const search = tool.input?.search || tool.output?.search || "";
        const replace = tool.input?.replace || tool.output?.replace || "";
        return { search, replace };
      })
      .filter((change) => change.replace !== undefined);

    if (allChanges.length === 0) {
      return;
    }

    onApplyContent({
      changes: allChanges,
    });
  };

  const isStreaming = status === "streaming";

  return (
    <div className="flex flex-col gap-y-1.5">
      <div className="flex justify-start w-full gap-y-1 flex-col">
        <ReasoningParts message={message} isLastMessage={isLastMessage} isStreaming={isStreaming} />
        <div className="flex flex-col">
          {groupMessageParts(message.parts).map((group, index) => {
            if (group.type === "research-group") {
              const actions = group.parts
                .map(extractActionFromToolPart)
                .filter((a): a is NonNullable<typeof a> => a !== null);
              const isLoading = actions.some((a) => a.status === "loading");
              return <ResearchGroup key={index} actions={actions} isLoading={isLoading} />;
            }
            return (
              <MessagePart
                key={index}
                part={group.part}
                status={status}
                isLastMessage={isLastMessage}
                organizationId={organizationId}
              />
            );
          })}
        </div>
        {shouldShowMetadata && (
          <div className="flex justify-between items-center mt-1">
            <div className="flex flex-col gap-y-1">
              {message.metadata?.createdAt && (
                <span className="text-gray-400 text-[11px]">
                  {format(new Date(message.metadata.createdAt), "HH:mm")}
                </span>
              )}
            </div>
            <div className="flex gap-x-1">
              <DialogTrigger>
                <Button className="p-0.5 hover:bg-gray-100 rounded">
                  <MoreVerticalRegular className="size-3" />
                </Button>
                <Popover>
                  <div className="flex flex-col gap-y-1 text-[11px] text-gray-500 divide-y divide-gray-200">
                    {message.metadata?.duration && (
                      <span className="p-0.5">
                        Response time: {formatDuration(message.metadata.duration)}
                      </span>
                    )}
                    {message.metadata?.usage && (
                      <span className="p-0.5">Tokens used: {message.metadata.usage}</span>
                    )}
                    {onApplyContent && replaceTools.length > 0 && (
                      <div className="p-0.5 pt-1">
                        <Button
                          onPress={handleApplyAll}
                          className="text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded w-full text-left"
                        >
                          Apply all changes ({replaceTools.length})
                        </Button>
                      </div>
                    )}
                  </div>
                </Popover>
              </DialogTrigger>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const MessagePart = memo(function MessagePart({
  part,
  status,
  isLastMessage,
  organizationId,
}: {
  part: any;
  status: "submitted" | "streaming" | "ready" | "error";
  isLastMessage: boolean;
  organizationId: string;
}) {
  if (part.type === "text") {
    return (
      <Streamdown
        isAnimating={status === "streaming" && isLastMessage}
        parseIncompleteMarkdown={true}
        linkSafety={{
          enabled: true,
          onLinkCheck: (url) => {
            // Allow internal links without modal
            return url.startsWith("/w/") || url.startsWith("#") || url.startsWith("/");
          },
        }}
        components={{
          ...streamdownHeadings,
          p: ({ children }) => <p className="text-gray-700 text-sm/relaxed">{children}</p>,
          li: ({ children }) => <li className="text-gray-700 text-sm/relaxed">{children}</li>,
        }}
      >
        {part.text}
      </Streamdown>
    );
  }

  if (part.type === "tool-replace_in_document") {
    return <ReplaceInDocumentTool tool={part} organizationId={organizationId} />;
  }

  if (part.type === "tool-create_document") {
    return <CreateDocumentTool tool={part} />;
  }

  if (part.type === "tool-move_documents") {
    return <MoveDocumentsTool tool={part} />;
  }

  if (part.type === "tool-show_documents") {
    return <ShowDocumentsTool tool={part} />;
  }

  // Reasoning parts are handled by ReasoningParts component at message level
  if (part.type === "reasoning") {
    return null;
  }

  if (part.type?.startsWith("tool-") && import.meta.env.DEV) {
    console.log("Unknown tool type:", part.type, part);
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 text-sm">
        <div className="font-medium text-yellow-800">Debug: Unknown Tool</div>
        <div className="text-yellow-700 text-xs mt-1">Type: {part.type}</div>
        <details className="mt-2">
          <summary className="text-xs cursor-pointer text-yellow-600">Show raw data</summary>
          <pre className="text-xs mt-1 bg-yellow-100 p-2 rounded overflow-auto">
            {JSON.stringify(part, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return null;
});

const THINKING_ANIMATION_VALUES = "0.7;.15;0.7";

function ThinkingAnimation() {
  return (
    <svg
      viewBox="0 0 105 105"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className="size-3.5"
    >
      <circle cx="12.5" cy="12.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="0s"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="12.5" cy="52.5" r="12.5" fillOpacity=".5">
        <animate
          attributeName="fill-opacity"
          begin="100ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="52.5" cy="12.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="300ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="52.5" cy="52.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="600ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="92.5" cy="12.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="800ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="92.5" cy="52.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="400ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="12.5" cy="92.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="700ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="52.5" cy="92.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="500ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="92.5" cy="92.5" r="12.5">
        <animate
          attributeName="fill-opacity"
          begin="200ms"
          dur="1s"
          values={THINKING_ANIMATION_VALUES}
          calcMode="linear"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

export type UserMessageProps = {
  message: DocumentChatAgentUIMessage;
};

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex flex-col gap-y-1.5 items-end">
      <div className="flex flex-col max-w-[80%] items-end">
        <div className="bg-black/4 text-gray-600 rounded-xl rounded-tr-sm p-1.5 flex flex-col gap-y-1">
          {message.parts?.map((part: any, index: number) => {
            if (part.type === "text") {
              return (
                <TextWithReferences key={index} text={part.text} className="text-sm/relaxed" />
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

// Renders text with inline reference pills
// Optimized to only parse when references are detected
function TextWithReferences({ text, className = "" }: { text: string; className?: string }) {
  const segments = useMemo(() => parseReferences(text), [text]);

  return (
    <span className={`whitespace-pre-wrap ${className}`}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.content}</span>;
        }

        if (segment.type === "reference" && segment.reference) {
          return <ReferenceSegment key={index} reference={segment.reference} />;
        }

        return null;
      })}
    </span>
  );
}

function ReferenceSegment({ reference }: { reference: ParsedTextSegment["reference"] }) {
  if (!reference) return null;

  if (reference.type === "document") {
    return <DocumentReferencePill documentId={reference.id} />;
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-medium">
      {reference.type}
    </span>
  );
}

function DocumentReferencePill({ documentId }: { documentId: string }) {
  const { organization } = useOrganization();
  const [document] = useQuery(
    queries.documents.byId({
      organizationId: organization.id,
      documentId,
    }),
  );

  const title = document?.title || "Untitled";
  const href = `/w/${organization.slug}/${documentId}`;

  return (
    <Link
      to={href}
      className="inline-flex px-0.5 rounded-sm items-center gap-x-1 relative before:bg-white/40 hover:before:bg-white/80 before:absolute before:inset-x-0 before:inset-y-px before:rounded-sm"
      title={`Open document: ${title}`}
    >
      <span className="max-w-[150px] truncate text-sm relative">@{title}</span>
    </Link>
  );
}
