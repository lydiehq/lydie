import { Button } from "@/components/generic/Button";
import { Separator } from "@/components/generic/Separator";
import { useFloatingAssistant } from "@/context/floating-assistant.context";
import { BotIcon } from "@/icons";

export function OnboardingStepAssistant() {
  const { open: openAssistant } = useFloatingAssistant();

  const handlePromptClick = (prompt: string) => {
    openAssistant({ prompt });
  };

  const promptButtons = [
    {
      title: "Organize documents",
      prompt: "Please organize our documents",
    },
    {
      title: "Create a new document",
      prompt: "Please create a new document",
    },
    {
      title: "Delete documents",
      prompt: "Please help me delete documents",
    },
  ];

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center gap-x-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <BotIcon className="size-6 text-gray-700" />
        </div>
        <span className="text-lg font-medium text-gray-900">Assistant</span>
      </div>
      <p className="text-gray-700 text-sm/relaxed">
        Use the assistant chat to help you organize and find your documents. The assistant can help you create, edit, and manage your content.
      </p>
      <div className="flex items-center gap-x-1 flex-wrap">
        {promptButtons.map(({ title, prompt }) => (
          <Button
            key={title}
            onPress={() => handlePromptClick(prompt)}
            intent="secondary"
            size="sm"
            rounded
          >
            {title}
          </Button>
        ))}
      </div>
    </div>
  );
}
