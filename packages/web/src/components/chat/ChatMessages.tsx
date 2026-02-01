import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index";

import { MoreVerticalRegular } from "@fluentui/react-icons";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { format } from "date-fns";
import { memo } from "react";
import { Button, DialogTrigger } from "react-aria-components";
import { Streamdown } from "streamdown";
import { StickToBottom } from "use-stick-to-bottom";

import { streamdownHeadings } from "./streamdown/headings";
import { CreateDocumentTool } from "./tools/CreateDocumentTool";
import { MoveDocumentsTool } from "./tools/MoveDocumentsTool";
import { ReplaceInDocumentTool } from "./tools/ReplaceInDocumentTool";
import { ResearchGroup, extractActionFromToolPart, groupMessageParts } from "./tools/ResearchGroup";
import { ShowDocumentsTool } from "./tools/ShowDocumentsTool";
import { UserMessage } from "./UserMessage";

type Props = {
  messages: DocumentChatAgentUIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  organizationId: string;
  user?: { name?: string | null; email?: string | null } | null;
  agentName?: string | null;
  onApplyContent?: (
    edits: any,
    onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  ) => void;
};

export function ChatMessages({
  messages,
  status,
  organizationId,
  user,
  agentName,
  onApplyContent,
}: Props) {
  const lastMessage = messages[messages.length - 1];
  const isSubmitting =
    status === "submitted" && messages.length > 0 && lastMessage?.role === "user";

  const shouldShowLoading =
    isSubmitting ||
    (status === "streaming" &&
      lastMessage?.role === "assistant" &&
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
              <UserMessage message={message} user={user} />
            ) : (
              <AssistantMessageWithTools
                message={message}
                onApplyContent={onApplyContent}
                status={status}
                isLastMessage={index === messages.length - 1}
                organizationId={organizationId}
                agentName={agentName}
              />
            )}
          </div>
        ))}
        {shouldShowLoading && <ThinkingIndicator agentName={agentName} />}
      </StickToBottom.Content>
    </StickToBottom>
  );
}

function ThinkingIndicator({ agentName }: { agentName?: string | null }) {
  const displayName = agentName || "Assistant";

  return (
    <div className="flex justify-start w-full">
      <div className="flex items-center gap-3">
        {/* Assistant Avatar */}
        <div className="size-5 rounded bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="flex items-center gap-x-2 text-gray-600 text-sm">
          <span className="font-medium text-gray-900">{displayName}</span>
          <ThinkingAnimation />
          <span>Thinking</span>
        </div>
      </div>
    </div>
  );
}

const AssistantMessageWithTools = memo(function AssistantMessageWithTools({
  message,
  onApplyContent,
  status,
  isLastMessage,
  organizationId,
  agentName,
}: {
  message: DocumentChatAgentUIMessage;
  onApplyContent?: (
    edits: any,
    onProgress?: (current: number, total: number, usedLLM: boolean) => void,
  ) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  isLastMessage: boolean;
  organizationId: string;
  agentName?: string | null;
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
  const displayName = agentName || "Assistant";

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

  return (
    <div className="flex flex-col gap-y-1.5">
      {/* Header with avatar and name */}
      <div className="flex items-center gap-x-2">
        {/* Assistant Avatar */}
        <div className="size-5 rounded bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
          <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <span className="text-sm font-medium text-gray-900">{displayName}</span>
        {message.metadata?.createdAt && (
          <span className="text-xs text-gray-400">
            {format(new Date(message.metadata.createdAt), "HH:mm")}
          </span>
        )}
      </div>

      {/* Message content */}
      <div className="flex justify-start w-full gap-y-1 flex-col">
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
      <circle cx="12.5" cy="52.5" r="12.5" fill-opacity=".5">
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
