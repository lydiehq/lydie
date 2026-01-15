import { DocumentChat, type DocumentChatRef } from "./DocumentChat";
import { queries } from "@lydie/zero/queries";
import { Button, MenuTrigger } from "react-aria-components";
import {
  ClockFadingIcon,
  AlertCircleIcon,
  CreateIcon,
} from "@/icons";
import type { ComponentType, SVGProps } from "react";
import { SidebarIcon } from "../layout/SidebarIcon";
import { type DocumentEditorHookResult } from "@/lib/editor/document-editor";
import { Menu, MenuItem } from "../generic/Menu";
import { useState, useMemo, forwardRef } from "react";
import clsx from "clsx";
import { Tooltip, TooltipTrigger } from "../generic/Tooltip";
import { formatDistanceToNow } from "date-fns";
import { createId } from "@lydie/core/id";
import type { QueryResultType } from "@rocicorp/zero";
import { isAdmin } from "@/utils/admin";
import { useAuth } from "@/context/auth.context";

type Props = {
  contentEditor: DocumentEditorHookResult;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  isCollapsed: boolean;
  onToggle: () => void;
};

export const EditorSidebar = forwardRef<DocumentChatRef, Props>(
  ({ contentEditor, doc, isCollapsed, onToggle }, ref) => {
    const { user } = useAuth();

    const [currentConversationId, setCurrentConversationId] = useState<string>(
      doc.conversations?.[0]?.id ?? createId()
    );

    const currentConversation = useMemo(() => {
      const existingConversation = doc.conversations?.find(
        (c) => c.id === currentConversationId
      );
      if (existingConversation) {
        return existingConversation;
      }
      return {
        id: currentConversationId,
        title: null,
        user_id: "",
        document_id: doc.id,
        created_at: Date.now(),
        updated_at: Date.now(),
        messages: [],
      };
    }, [doc.conversations, currentConversationId, doc.id]);

    const createNewConversation = () => {
      setCurrentConversationId(createId());
    };

    return (
      <div className="overflow-hidden flex flex-col border-l border-black/8 bg-surface rounded-r-lg size-full">
        <div
          className={clsx(
            "flex justify-between shrink-0 border-b border-black/8",
            isCollapsed
              ? "h-full flex-col p-1.5"
              : "h-10 items-center flex-row p-3"
          )}
        >
          {!isCollapsed && (
            <span
              className="text-sm font-medium text-gray-700 truncate"
              title={currentConversation?.title || "New Conversation"}
            >
              {currentConversation?.title || "New Conversation"}
            </span>
          )}
          <div
            className={clsx(
              "flex",
              isCollapsed ? "flex-col gap-y-1" : "flex-row gap-x-0.5"
            )}
          >
            {isAdmin(user) && (
              <SidebarButton
                icon={AlertCircleIcon}
                tooltip="Log current conversation"
                onPress={() => {
                  console.dir(currentConversation);
                }}
                isCollapsed={isCollapsed}
              />
            )}
            <SidebarButton
              icon={CreateIcon}
              tooltip="New Conversation"
              onPress={createNewConversation}
              isCollapsed={isCollapsed}
            />
            <ConversationHistoryDropdown
              conversations={doc.conversations}
              onSelect={(id) => {
                setCurrentConversationId(id);
              }}
              isCollapsed={isCollapsed}
            />
            <TooltipTrigger>
              <Button
                className={clsx(
                  "rounded hover:bg-gray-100 text-gray-700 group flex flex-col items-center justify-center",
                  isCollapsed ? "aspect-square" : "p-1"
                )}
                onPress={onToggle}
                aria-label="Toggle Sidebar"
              >
                <SidebarIcon direction="right" collapsed={isCollapsed} />
              </Button>
              <Tooltip placement={isCollapsed ? "left" : undefined}>
                Toggle Sidebar
              </Tooltip>
            </TooltipTrigger>
          </div>
        </div>
        {!isCollapsed && (
          <DocumentChat
            key={currentConversation.id}
            contentEditor={contentEditor}
            ref={ref}
            doc={doc}
            conversation={currentConversation}
          />
        )}
      </div>
    );
  }
);

EditorSidebar.displayName = "EditorSidebar";

type ConversationHistoryDropdownProps = {
  conversations: NonNullable<
    QueryResultType<typeof queries.documents.byId>
  >["conversations"];
  onSelect: (id: string) => void;
  isCollapsed: boolean;
};

function ConversationHistoryDropdown({
  conversations,
  onSelect,
  isCollapsed,
}: ConversationHistoryDropdownProps) {
  return (
    <MenuTrigger>
      <SidebarButton
        icon={ClockFadingIcon}
        tooltip="Conversation History"
        onPress={() => {}}
        isCollapsed={isCollapsed}
      />
      <Menu placement="bottom end">
        {conversations.map((conversation) => (
          <MenuItem
            key={conversation.id}
            onAction={() => onSelect(conversation.id)}
            className="flex justify-between"
          >
            <span className="truncate">
              {conversation.title || "Untitled Conversation"}
            </span>
            <span className="text-xs text-gray-500 ml-1">
              {formatDistanceToNow(new Date(conversation.created_at))}
            </span>
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}

type SidebarButtonProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tooltip: string;
  onPress: () => void;
  isCollapsed: boolean;
};

function SidebarButton({
  icon: Icon,
  tooltip,
  onPress,
  isCollapsed,
}: SidebarButtonProps) {
  return (
    <TooltipTrigger>
      <Button
        className={clsx(
          "rounded hover:bg-gray-100 text-gray-600 group flex flex-col items-center justify-center",
          isCollapsed ? "aspect-square" : "p-1"
        )}
        onPress={onPress}
      >
        <Icon className="size-3.5" />
      </Button>
      <Tooltip placement={isCollapsed ? "left" : undefined}>{tooltip}</Tooltip>
    </TooltipTrigger>
  );
}
