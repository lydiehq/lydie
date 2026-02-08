import { AddRegular, ChatMultipleRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { useNavigate } from "@tanstack/react-router";

import { useOrganization } from "@/context/organization.context";

interface AssistantHeaderProps {
  conversationTitle: string | null;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function AssistantHeader({
  conversationTitle,
  onToggleSidebar,
  sidebarOpen,
}: AssistantHeaderProps) {
  const navigate = useNavigate();
  const { organization } = useOrganization();

  const handleNewConversation = () => {
    navigate({
      to: "/w/$organizationSlug/assistant",
      params: { organizationSlug: organization.slug },
    });
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-black/8 bg-white shrink-0">
      <div className="flex items-center gap-x-2">
        {conversationTitle && (
          <span className="text-sm font-medium text-gray-900 truncate max-w-md">
            {conversationTitle}
          </span>
        )}
      </div>
      <div className="flex items-center gap-x-2">
        {/* New conversation button */}
        <TooltipTrigger>
          <Button
            onPress={handleNewConversation}
            size="icon-sm"
            intent="ghost"
            aria-label="New conversation"
            className="text-gray-500 hover:text-gray-700"
          >
            <AddRegular className="size-4" />
          </Button>
          <Tooltip placement="bottom">New conversation</Tooltip>
        </TooltipTrigger>
        {/* Conversations toggle button */}
        <TooltipTrigger>
          <Button
            onPress={onToggleSidebar}
            size="icon-sm"
            intent="ghost"
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            className={sidebarOpen ? "text-gray-700" : "text-gray-500"}
          >
            <ChatMultipleRegular className="size-4" />
          </Button>
          <Tooltip placement="bottom">
            {sidebarOpen ? "Hide conversations" : "Show conversations"}
          </Tooltip>
        </TooltipTrigger>
      </div>
    </div>
  );
}
