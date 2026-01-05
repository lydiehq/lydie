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
  const { organizationSlug } = Route.useParams();

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
      selectedConversation={selectedConversation}
      onUpgradeClick={handleUpgradeClick}
    >
      <Outlet />
    </AssistantProvider>
  );
}
