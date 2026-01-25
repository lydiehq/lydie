import { ChatRegular, EditRegular } from "@fluentui/react-icons";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { useCallback } from "react";
import { Button } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";

import { Tooltip, TooltipTrigger } from "../generic/Tooltip";
import { SidebarIcon } from "../layout/SidebarIcon";

type Props = {
  isCollapsed: boolean;
  onToggle: () => void;
  conversationId: string;
  onNewConversation: () => void;
};

export function AssistantSidebar({
  isCollapsed,
  onToggle,
  conversationId,
  onNewConversation,
}: Props) {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [conversations] = useQuery(
    queries.assistant.conversationsByUser({
      organizationSlug: organization.slug,
    }),
  );

  const handleNewConversation = useCallback(() => {
    onNewConversation();
    navigate({
      to: "/w/$organizationSlug/assistant",
      params: { organizationSlug: organization.slug },
    });
  }, [onNewConversation, navigate, organization.slug]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      navigate({
        to: "/w/$organizationSlug/assistant/$chatId",
        params: { organizationSlug: organization.slug, chatId: id },
      });
    },
    [navigate, organization.slug],
  );

  return (
    <div className="overflow-hidden flex flex-col border-l border-black/8 bg-surface rounded-r-lg size-full">
      <div
        className={clsx(
          "flex justify-between shrink-0 border-b border-black/8",
          isCollapsed ? "h-full flex-col p-1.5" : "h-10 items-center flex-row p-3",
        )}
      >
        {!isCollapsed && (
          <span className="text-sm font-medium text-gray-700 truncate">Conversations</span>
        )}
        <div className={clsx("flex", isCollapsed ? "flex-col gap-y-1" : "flex-row gap-x-0.5")}>
          <TooltipTrigger>
            <Button
              className={clsx(
                "rounded hover:bg-gray-100 text-gray-600 group flex flex-col items-center justify-center",
                isCollapsed ? "aspect-square" : "p-1",
              )}
              onPress={handleNewConversation}
            >
              <EditRegular className="size-3.5" />
            </Button>
            <Tooltip placement={isCollapsed ? "left" : undefined}>New Conversation</Tooltip>
          </TooltipTrigger>
          <TooltipTrigger>
            <Button
              className={clsx(
                "rounded hover:bg-gray-100 text-gray-700 group flex flex-col items-center justify-center",
                isCollapsed ? "aspect-square" : "p-1",
              )}
              onPress={onToggle}
              aria-label="Toggle Sidebar"
            >
              <SidebarIcon direction="right" collapsed={isCollapsed} />
            </Button>
            <Tooltip placement={isCollapsed ? "left" : undefined}>Toggle Sidebar</Tooltip>
          </TooltipTrigger>
        </div>
      </div>
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          {conversations && conversations.length > 0 ? (
            <div className="flex flex-col">
              {conversations.map((conversation) => {
                const isActive = conversation.id === conversationId;
                const firstMessage = conversation.messages?.[0];
                const preview =
                  firstMessage?.role === "user"
                    ? typeof firstMessage.parts === "string"
                      ? firstMessage.parts
                      : firstMessage.parts?.[0]?.text || "New conversation"
                    : conversation.title || "New conversation";

                return (
                  <button
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    className={clsx(
                      "flex flex-col p-3 border-b border-black/8 hover:bg-gray-50 transition-colors text-left",
                      isActive && "bg-blue-50 hover:bg-blue-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <ChatRegular className="size-4 text-gray-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 line-clamp-2 break-words">{preview}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDistanceToNow(new Date(conversation.updated_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <ChatRegular className="size-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No conversations yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
