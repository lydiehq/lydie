import { PanelLeftRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";

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
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-black/8 bg-white shrink-0">
      <div className="flex items-center gap-x-2">
        <TooltipTrigger>
          <Button
            onPress={onToggleSidebar}
            size="icon-sm"
            intent="ghost"
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            className={sidebarOpen ? "text-gray-700" : "text-gray-500"}
          >
            <PanelLeftRegular className="size-4" />
          </Button>
          <Tooltip placement="bottom">
            {sidebarOpen ? "Hide conversations" : "Show conversations"}
          </Tooltip>
        </TooltipTrigger>
        {conversationTitle && (
          <span className="text-sm font-medium text-gray-900 truncate max-w-md">
            {conversationTitle}
          </span>
        )}
      </div>
    </div>
  );
}
