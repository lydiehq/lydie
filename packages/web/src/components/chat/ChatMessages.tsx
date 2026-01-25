import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index";

import { MoreVerticalRegular } from "@fluentui/react-icons";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
import { Button, DialogTrigger } from "react-aria-components";
import { Streamdown } from "streamdown";
import { StickToBottom } from "use-stick-to-bottom";

import { Popover } from "../generic/Popover";
import { UserMessage } from "./Message";
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
      <StickToBottom.Content className="flex flex-col gap-y-2 p-3">
        <AnimatePresence initial={false}>
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
        </AnimatePresence>
        {shouldShowLoading && <ThinkingIndicator />}
      </StickToBottom.Content>
    </StickToBottom>
  );
}

function ThinkingIndicator() {
  return (
    <motion.div
      className="flex justify-start w-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-gray-600 text-sm">
          <ThinkingAnimation />
          <span>Thinking</span>
          <span className="inline-flex gap-0.5">
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0,
              }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0.2,
              }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0.4,
              }}
            >
              .
            </motion.span>
          </span>
        </div>
      </div>
    </motion.div>
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

  return (
    <motion.div
      className="flex justify-start w-full gap-y-1 flex-col"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
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
        <div className="flex justify-between items-center">
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
    </motion.div>
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

function ThinkingAnimation() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      className="size-4 text-gray-400"
    >
      <rect width="7.33" height="7.33" x="1" y="1" fill="currentColor">
        <animate
          id="SVGzjrPLenI"
          attributeName="x"
          begin="0;SVGXAURnSRI.end+0.2s"
          dur="1s"
          values="1;4;1"
        />
        <animate attributeName="y" begin="0;SVGXAURnSRI.end+0.2s" dur="1s" values="1;4;1" />
        <animate
          attributeName="width"
          begin="0;SVGXAURnSRI.end+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="0;SVGXAURnSRI.end+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="8.33" y="1" fill="currentColor">
        <animate
          attributeName="x"
          begin="SVGzjrPLenI.begin+0.1s"
          dur="1s"
          values="8.33;11.33;8.33"
        />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="1;4;1" />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.1s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.1s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="1" y="8.33" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.1s" dur="1s" values="1;4;1" />
        <animate
          attributeName="y"
          begin="SVGzjrPLenI.begin+0.1s"
          dur="1s"
          values="8.33;11.33;8.33"
        />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.1s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.1s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="15.66" y="1" fill="currentColor">
        <animate
          attributeName="x"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="15.66;18.66;15.66"
        />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.2s" dur="1s" values="1;4;1" />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="8.33" y="8.33" fill="currentColor">
        <animate
          attributeName="x"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="8.33;11.33;8.33"
        />
        <animate
          attributeName="y"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="0.6s"
          values="8.33;11.33;8.33"
        />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="1" y="15.66" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="1;4;1" />
        <animate
          attributeName="y"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="15.66;18.66;15.66"
        />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.2s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="15.66" y="8.33" fill="currentColor">
        <animate
          attributeName="x"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="1s"
          values="15.66;18.66;15.66"
        />
        <animate
          attributeName="y"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="0.6s"
          values="8.33;11.33;8.33"
        />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="8.33" y="15.66" fill="currentColor">
        <animate
          attributeName="x"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="1s"
          values="8.33;11.33;8.33"
        />
        <animate
          attributeName="y"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="0.6s"
          values="15.66;18.66;15.66"
        />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.3s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
      <rect width="7.33" height="7.33" x="15.66" y="15.66" fill="currentColor">
        <animate
          id="SVGXAURnSRI"
          attributeName="x"
          begin="SVGzjrPLenI.begin+0.4s"
          dur="1s"
          values="15.66;18.66;15.66"
        />
        <animate
          attributeName="y"
          begin="SVGzjrPLenI.begin+0.4s"
          dur="1s"
          values="15.66;18.66;15.66"
        />
        <animate
          attributeName="width"
          begin="SVGzjrPLenI.begin+0.4s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
        <animate
          attributeName="height"
          begin="SVGzjrPLenI.begin+0.4s"
          dur="1s"
          values="7.33;1.33;7.33"
        />
      </rect>
    </svg>
  );
}
