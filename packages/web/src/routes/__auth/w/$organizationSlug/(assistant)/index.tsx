import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Surface } from "@/components/layout/Surface";
import { useCallback } from "react";
import { AssistantInput } from "@/components/assistant/AssistantInput";
import { useAssistant } from "@/context/assistant.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useAuth } from "@/context/auth.context";
import { Button } from "@/components/generic/Button";
import { Eyebrow } from "@/components/generic/Eyebrow";

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
          {/* <div className="flex flex-col gap-y-4 items-center w-full">
            <h1 className="text-2xl font-medium text-gray-900">
              Ask anything about your documents
            </h1>
            <AssistantInput
              onSubmit={handleSubmit}
              onStop={stop}
              placeholder="Ask anything. Use @ to refer to documents"
            />
          </div> */}
          <div className="flex flex-col gap-y-2">
            <Eyebrow>Let&apos;s get you started!</Eyebrow>
            <div className="divide-x divide-y grid grid-cols-2 ring divide-black/8 ring-black/8 rounded-lg w-full">
              <OnboardingStep
                header="Connect integrations"
                description="Connect your favorite tools to Lydie to get started."
                buttonText="Connect"
              />
              <OnboardingStep
                header="Create your first document"
                description="Start by creating a document to organize your knowledge."
                buttonText="Create"
              />
              <OnboardingStep
                header="Import content"
                description="Import existing content from various sources."
                buttonText="Import"
              />
              <OnboardingStep
                header="Invite team members"
                description="Collaborate with your team by inviting members."
                buttonText="Invite"
              />
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function Onboarding() {
  const { user } = useAuth();
  return (
    <div className="size-full grid grid-cols-2 divide-x divide-black/8">
      <div className="flex flex-col items-center justify-center size-full">
        <div className="flex flex-col gap-y-4 max-w-md mx-auto">
          <div className="flex gap-x-1">
            {[...Array(4)].map(() => (
              <div className="h-1 w-3 rounded-md bg-gray-200"></div>
            ))}
          </div>
          <h1 className="text-2xl font-medium text-gray-900">
            Welcome to Lydie, {user.name?.split(" ")[0]}!
          </h1>
          <p className="text-gray-500 text-sm/relaxed">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Ipsam odio
            praesentium adipisci natus nihil aut harum laboriosam esse, ducimus
            a.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center size-full "></div>
    </div>
  );
}

interface OnboardingStepProps {
  header: string;
  description: string;
  buttonText: string;
}

function OnboardingStep({
  header,
  description,
  buttonText,
}: OnboardingStepProps) {
  return (
    <div className="p-3 flex flex-col gap-y-1 items-start">
      <span className="font-medium text-gray-950">{header}</span>
      <p className="text-gray-500 text-sm/relaxed">{description}</p>
      <Button onPress={() => null} size="xs">
        {buttonText}
      </Button>
    </div>
  );
}
