import { ChatRegular, EditRegular } from "@fluentui/react-icons";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { useCallback } from "react";
import { Button } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";

type Props = {
  isOpen: boolean;
  conversationId: string;
};

export function AssistantSidebar({
  isOpen,
  conversationId,
}: Props) {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [conversations] = useQuery(
    queries.assistant.conversationsByUser({
      organizationSlug: organization.slug,
    }),
  );

  const handleNewConversation = useCallback(() => {
    navigate({
      to: "/w/$organizationSlug/assistant",
      params: { organizationSlug: organization.slug },
    });
  }, [navigate, organization.slug]);

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
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="overflow-hidden flex flex-col border-r border-black/8 bg-surface shrink-0"
        >
          <div className="flex items-center justify-between h-10 px-3 border-b border-black/8 shrink-0">
            <span className="text-sm font-medium text-gray-700">Conversations</span>
            <div className="flex flex-row gap-x-0.5">
              <TooltipTrigger>
                <Button
                  className="rounded hover:bg-gray-100 text-gray-600 group p-1"
                  onPress={handleNewConversation}
                >
                  <EditRegular className="size-3.5" />
                </Button>
                <Tooltip>New Conversation</Tooltip>
              </TooltipTrigger>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations && conversations.length > 0 ? (
              <div className="flex flex-col">
                {conversations.map((conversation) => {
                  const isActive = conversation.id === conversationId;
                  const messages = conversation.messages;
                  const firstMessage = Array.isArray(messages) && messages.length > 0
                    ? messages[0]
                    : null;
                  const preview =
                    firstMessage?.role === "user"
                      ? typeof firstMessage.parts === "string"
                        ? firstMessage.parts
                        : Array.isArray(firstMessage.parts) && firstMessage.parts[0]?.text
                          ? firstMessage.parts[0].text
                          : "New conversation"
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
