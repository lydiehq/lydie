import { Surface } from "@/components/layout/Surface";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useAssistant } from "@/context/assistant.context";
import { AssistantInput } from "@/components/assistant/AssistantInput";

export const Route = createFileRoute("/__auth/w/$organizationSlug/_assistant/")(
  {
    component: RouteComponent,
    validateSearch: z.object({
      tree: z.string().optional(),
      q: z.string().optional(),
      focusSearch: z.boolean().optional(),
    }),
  }
);

const suggestions = [
  "What are my last 3 documents about?",
  "Show me all documents that mention coffee",
  "Find documents related to project planning",
];

function RouteComponent() {
  const navigate = useNavigate();
  const { organizationSlug } = Route.useParams();
  const { sendMessage, conversationId } = useAssistant();

  const handleSubmit = (text: string) => {
    // Send the message through context
    sendMessage({
      text,
      metadata: {
        createdAt: new Date().toISOString(),
      },
    });

    // Navigate to conversation-specific page
    navigate({
      to: "/w/$organizationSlug/assistant/$conversationId",
      params: { organizationSlug, conversationId },
    });
  };

  return (
    <div className="p-1 size-full">
      <Surface className="flex flex-col">
        <div className="w-full py-32 flex items-center justify-center flex-col gap-y-4">
          <div className="flex w-full max-w-xl flex-col gap-y-4 items-center">
            <h1 className="text-xl font-medium text-gray-950">
              Ask anything about your documents
            </h1>
            <AssistantInput
              onSubmit={handleSubmit}
              placeholder="Ask a question..."
              showSuggestions={true}
              suggestions={suggestions}
              className="w-full"
            />
          </div>
        </div>

        {/* <HomeFileExplorer /> */}
      </Surface>
    </div>
  );
}
