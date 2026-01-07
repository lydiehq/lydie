import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AssistantProvider } from "@/context/assistant.context";
import { useOrganization } from "@/context/organization.context";
import { queries } from "@lydie/zero/queries";
import { z } from "zod";

const assistantSearchSchema = z.object({
  conversationId: z.string().optional(),
});

export const Route = createFileRoute("/__auth/w/$organizationSlug/(assistant)")(
  {
    component: AssistantLayout,
    validateSearch: assistantSearchSchema,
    loaderDeps: ({ search }) => ({ conversationId: search.conversationId }),
    loader: async ({ context, params, deps }) => {
      const { zero, organization } = context;
      const { conversationId } = deps;

      if (!conversationId) {
        return { conversation: undefined };
      }

      const conversation = await zero.run(
        queries.assistant.byId({
          organizationId: organization.id,
          conversationId,
        }),
        { type: "complete" }
      );

      return { conversation };
    },
  }
);

function AssistantLayout() {
  const { organization } = useOrganization();
  const { conversation } = Route.useLoaderData();

  return (
    <AssistantProvider
      organizationId={organization.id}
      conversation={conversation}
    >
      <Outlet />
    </AssistantProvider>
  );
}
