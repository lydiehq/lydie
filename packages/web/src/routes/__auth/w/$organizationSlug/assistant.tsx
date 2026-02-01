import { createId } from "@lydie/core/id";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { AssistantHeader } from "@/components/assistant/AssistantHeader";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { Surface } from "@/components/layout/Surface";
import { useOrganization } from "@/context/organization.context";

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant")({
  component: AssistantLayout,
  ssr: false,
});

function AssistantLayout() {
  const { organization } = useOrganization();
  const params = useParams({
    from: "/__auth/w/$organizationSlug/assistant",
  });
  // Get chatId from the matched route params (may be undefined on index route)
  const urlChatId = (params as { chatId?: string }).chatId;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Eagerly generate conversation ID if not in URL
  const conversationId = useMemo(() => {
    if (urlChatId) {
      return urlChatId;
    }
    return createId();
  }, [urlChatId]);

  // Query for existing conversation data
  const [existingConversation] = useQuery(
    urlChatId
      ? queries.assistant.byId({
          organizationId: organization.id,
          conversationId: urlChatId,
        })
      : null,
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full flex flex-col">
        <AssistantHeader
          conversationTitle={existingConversation?.title ?? null}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
        />
        <div className="flex flex-1 overflow-hidden">
          <AssistantSidebar isOpen={sidebarOpen} conversationId={conversationId} />
          <div className="flex-1 flex flex-col h-full mx-auto w-full max-w-xl px-4">
            <Outlet />
          </div>
        </div>
      </Surface>
    </div>
  );
}
