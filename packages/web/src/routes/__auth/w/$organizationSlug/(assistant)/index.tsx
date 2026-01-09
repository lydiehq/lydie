import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Surface } from "@/components/layout/Surface";
import { useCallback } from "react";
import { AssistantInput } from "@/components/assistant/AssistantInput";
import { useAssistant } from "@/context/assistant.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { Separator } from "@/components/generic/Separator";
import { Button } from "react-aria-components";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/"
)({
  component: PageComponent,
  ssr: false,
});

function PageComponent() {
  const { sendMessage, stop, conversationId } = useAssistant();
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    (text: string) => {
      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
        },
      });

      navigate({
        to: "/w/$organizationSlug/assistant",
        from: "/w/$organizationSlug",
        search: {
          conversationId,
        },
      });
    },
    [sendMessage, navigate, conversationId]
  );

  const { createDocument } = useDocumentActions();

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <div className="mt-[34svh] max-w-xl mx-auto flex flex-col gap-y-4 items-center w-full">
          <div className="flex flex-col gap-y-4 items-center w-full">
            <h1 className="text-2xl font-medium text-gray-900">
              Ask anything about your documents
            </h1>
            <AssistantInput
              onSubmit={handleSubmit}
              onStop={stop}
              placeholder="Ask anything. Use @ to refer to documents"
            />
          </div>
          <div className="">
            <div className="flex flex-col gap-y-0.5">
              <OnboardingButton />
              <OnboardingButton />
              <OnboardingButton />
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}
function OnboardingButton() {
  return (
    <div className="">
      <Button
        onPress={() => null}
        className="px-2 py-1.5 hover:bg-black/5 rounded-lg flex items-center gap-x-2"
      >
        <div className="rounded-full size-3 ring ring-black/20"></div>
        <span className="text-sm font-medium text-gray-700">
          Create a new document
        </span>
      </Button>
    </div>
  );
}
