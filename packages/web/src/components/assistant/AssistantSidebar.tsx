import { Button } from "react-aria-components";
import { SquarePen, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import { useZero } from "@/services/zero";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { SidebarIcon } from "../layout/SidebarIcon";
import { Tooltip, TooltipTrigger } from "../generic/Tooltip";
import { mutators } from "@lydie/zero/mutators";

type Conversation = NonNullable<
  QueryResultType<typeof queries.assistant.conversations>
>[number];

type Props = {
  conversations: Conversation[];
  currentConversationId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
};

export function AssistantSidebar({
  conversations,
  currentConversationId,
  onSelect,
  onNewChat,
  isCollapsed,
  onToggle,
}: Props) {
  const z = useZero();

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      z.mutate(mutators.assistantConversation.delete({ conversationId: id }));
      if (id === currentConversationId) {
        onNewChat();
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200 overflow-hidden">
      <div
        className={clsx(
          "flex items-center p-2 shrink-0",
          isCollapsed ? "flex-col gap-2 justify-center" : "justify-between"
        )}
      >
        {!isCollapsed && (
          <span className="font-semibold text-sm text-gray-700 px-2">
            Chats
          </span>
        )}
        <TooltipTrigger>
          <Button
            onPress={onNewChat}
            className={clsx(
              "p-1.5 rounded-md text-gray-600 hover:bg-gray-200 transition-colors",
              isCollapsed &&
                "w-full aspect-square flex items-center justify-center"
            )}
          >
            <SquarePen className="size-4" />
          </Button>
          <Tooltip placement="right">New Chat</Tooltip>
        </TooltipTrigger>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 scrollbar-thin">
        {conversations.map((conversation) => {
          const isActive = conversation.id === currentConversationId;
          return (
            <div
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={clsx(
                "group flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm transition-colors relative",
                isActive
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-600 hover:bg-gray-200/50",
                isCollapsed && "justify-center px-1"
              )}
            >
              {!isCollapsed ? (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">
                      {conversation.title || "Untitled Conversation"}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {formatDistanceToNow(new Date(conversation.created_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                  <Button
                    onPress={(e: any) => handleDelete(e, conversation.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 hover:text-red-600 rounded transition-all"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : (
                <TooltipTrigger>
                  <div className="size-2 rounded-full bg-gray-400 group-hover:bg-gray-600" />
                  <Tooltip placement="right">
                    {conversation.title || "Untitled Conversation"}
                    <div className="text-xs opacity-75">
                      {formatDistanceToNow(new Date(conversation.created_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </Tooltip>
                </TooltipTrigger>
              )}
            </div>
          );
        })}
      </div>

      <div
        className={clsx(
          "p-2 border-t border-gray-200 shrink-0 flex",
          isCollapsed ? "justify-center" : "justify-end"
        )}
      >
        <TooltipTrigger>
          <Button
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 transition-colors"
            onPress={onToggle}
          >
            <SidebarIcon direction="left" collapsed={isCollapsed} />
          </Button>
          <Tooltip placement="right">Toggle Sidebar</Tooltip>
        </TooltipTrigger>
      </div>
    </div>
  );
}
