import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/layout/Surface";
import { Button } from "@/components/generic/Button";
import { Separator } from "@/components/generic/Separator";
import { useFloatingAssistant } from "@/context/floating-assistant.context";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/"
)({
  component: PageComponent,
  ssr: false,
});

function PageComponent() {
  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-y-auto size-full">
        <Onboarding />
      </Surface>
    </div>
  );
}

function Onboarding() {
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

  const progress = 0; // You can calculate this based on your needs
  const size = 20;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex items-center justify-center size-full">
      <div className="p-12">
        <div className="flex flex-col gap-y-6 max-w-lg">
          <div className="flex items-center gap-x-2">
            <svg width={size} height={size} className="transform -rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#e5e7eb"
                strokeWidth={strokeWidth}
                fill="none"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#9c9c9c"
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
          </div>
          <span className="text-lg font-medium text-gray-900">Let's get you started!</span>
          <p className="text-gray-700 text-sm/relaxed">
            We&apos;ve created a few documents for you to get started. Use the assistant chat to help you organize and find your documents.
          </p>
          <div className="flex items-center gap-x-1">
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
          <Separator />
          <Button intent="secondary" size="sm">Skip and delete documents</Button>
        </div>
      </div>
    </div>
  );
}