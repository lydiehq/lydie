import { ChevronDownRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { dropdownItemStyles } from "@lydie/ui/components/generic/ListBox";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { SearchField } from "@lydie/ui/components/generic/SearchField";
import { SelectItem, SelectSection } from "@lydie/ui/components/generic/Select";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useMemo } from "react";
import {
  Select as AriaSelect,
  Autocomplete,
  composeRenderProps,
  ListBox,
  ListBoxItem,
  Button as RACButton,
  SelectValue,
  useFilter,
} from "react-aria-components";

import { useOrganization } from "@/context/organization.context";
import { composeTailwindRenderProps } from "@/utils/focus-ring";

type ConversationGroup = {
  title: string;
  conversations: any[];
};

const MAX_CONVERSATIONS_TO_SHOW = 15;

interface ConversationDropdownProps {
  conversationId: string;
  onSelectConversation: (id: string) => void;
}

export function ConversationDropdown({
  conversationId,
  onSelectConversation,
}: ConversationDropdownProps) {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const { contains } = useFilter({ sensitivity: "base" });
  const [conversations] = useQuery(
    queries.assistant.conversationsByUser({
      organizationSlug: organization.slug,
    }),
  );

  const currentConversation = useMemo(() => {
    return conversations?.find((c) => c.id === conversationId);
  }, [conversations, conversationId]);

  const displayTitle = useMemo(() => {
    if (currentConversation) {
      return currentConversation.title || "New conversation";
    }
    return "New Chat";
  }, [currentConversation]);

  const getConversationTitle = useCallback((conversation: any) => {
    return conversation.title || "New conversation";
  }, []);

  const groupConversations = useCallback((convs: typeof conversations) => {
    if (!convs || convs.length === 0) return [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const groups: ConversationGroup[] = [
      { title: "Today", conversations: [] },
      { title: "Yesterday", conversations: [] },
      { title: "Previous 7 days", conversations: [] },
      { title: "Previous 30 days", conversations: [] },
      { title: "Older", conversations: [] },
    ];

    for (const conversation of convs) {
      const updatedAt = new Date(conversation.updated_at);
      if (updatedAt >= today) {
        groups[0].conversations.push(conversation);
      } else if (updatedAt >= yesterday) {
        groups[1].conversations.push(conversation);
      } else if (updatedAt >= sevenDaysAgo) {
        groups[2].conversations.push(conversation);
      } else if (updatedAt >= thirtyDaysAgo) {
        groups[3].conversations.push(conversation);
      } else {
        groups[4].conversations.push(conversation);
      }
    }

    return groups.filter((group) => group.conversations.length > 0);
  }, []);

  const limitedConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations.slice(0, MAX_CONVERSATIONS_TO_SHOW);
  }, [conversations]);

  const hasMoreConversations = useMemo(() => {
    return (conversations?.length || 0) > MAX_CONVERSATIONS_TO_SHOW;
  }, [conversations]);

  const groupedConversations = useMemo(() => {
    return groupConversations(limitedConversations);
  }, [limitedConversations, groupConversations]);

  const handleSeeAllConversations = useCallback(() => {
    navigate({
      to: "/w/$organizationSlug/assistant",
      params: { organizationSlug: organization.slug },
    });
  }, [navigate, organization.slug]);

  return (
    <AriaSelect
      value={conversationId || null}
      onChange={(key) => {
        if (key && typeof key === "string") {
          onSelectConversation(key);
        }
      }}
      aria-label="Select conversation"
      className="group flex flex-col gap-1 min-w-[200px]"
    >
      <Button intent="ghost" size="sm" className="justify-start">
        <SelectValue className="max-w-[200px] truncate text-sm">
          {({ selectedText }) => selectedText || displayTitle}
        </SelectValue>
        <ChevronDownRegular className="size-3.5 text-gray-500 shrink-0" aria-hidden="true" />
      </Button>
      <Popover className="min-w-[300px] max-h-[500px] flex flex-col p-0" placement="bottom start">
        <Autocomplete filter={contains}>
          <div className="p-2 border-b border-gray-200">
            <SearchField
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full"
            />
          </div>
          <ListBox
            items={groupedConversations}
            className="outline-none max-h-[400px] overflow-auto p-1"
            selectionMode="single"
          >
            {(group: ConversationGroup) => (
              <SelectSection
                key={group.title}
                id={group.title}
                title={group.title}
                items={group.conversations}
              >
                {(conversation: any) => {
                  if (!conversation?.id) {
                    return <SelectItem id={`empty-${Math.random()}`} textValue="" />;
                  }
                  const title = getConversationTitle(conversation);
                  const isSelected = conversation.id === conversationId;

                  return (
                    <ListBoxItem
                      textValue={title}
                      className={composeTailwindRenderProps(
                        dropdownItemStyles,
                        "flex justify-between",
                      )}
                    >
                      <span>{title}</span>
                      <span className="text-xs text-gray-500">
                        {" "}
                        {formatDistanceToNow(new Date(conversation.updated_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </ListBoxItem>
                  );
                }}
              </SelectSection>
            )}
          </ListBox>
        </Autocomplete>
        <div className="border-t border-gray-200 p-1 flex flex-col gap-1">
          {hasMoreConversations && (
            <RACButton
              onPress={handleSeeAllConversations}
              className="flex items-center justify-center w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <span>See all conversations</span>
            </RACButton>
          )}
        </div>
      </Popover>
    </AriaSelect>
  );
}
