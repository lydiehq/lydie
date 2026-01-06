import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AssistantProvider } from "@/context/assistant.context";
import { useOrganization } from "@/context/organization.context";
import { useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/__auth/w/$organizationSlug/_assistant")({
  component: AssistantLayout,
});

function AssistantLayout() {
  const { organization } = useOrganization();
  const router = useRouter();
  const params = Route.useParams();
  const { organizationSlug } = params;

  // Extract conversationId from params if present (only available on conversation-specific routes)
  const conversationId = 'conversationId' in params ? (params as any).conversationId : undefined;

  // For now, we default to a new conversation. Later we can add conversation management.
  const selectedConversation = undefined;

  const handleUpgradeClick = () => {
    router.navigate({
      to: "/w/$organizationSlug/settings/billing",
      params: { organizationSlug },
    });
  };

  return (
    <AssistantProvider
      organizationId={organization.id}
      conversationId={conversationId}
      selectedConversation={selectedConversation}
      onUpgradeClick={handleUpgradeClick}
    >
      <Outlet />
    </AssistantProvider>
  );
}
