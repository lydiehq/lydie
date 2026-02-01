import { BotRegular, SparkleRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { useFloatingAssistant } from "@/hooks/use-floating-assistant";

import { OnboardingContainer } from "./OnboardingContainer";

const TASKS: Array<{
  id: string;
  title: string;
  description: string;
  prompt: string;
  hasContent: boolean;
}> = [
  {
    id: "organize-apollo",
    title: "Organize Project Apollo documents",
    description: "Ask the assistant to help organize demo documents",
    prompt: "Please look at all our documents related to project apollo and organize them",
    hasContent: false,
  },
  {
    id: "change-text",
    title: "Transform a story",
    description: "See how the assistant can rewrite and adapt content",
    prompt:
      "Please rewrite this story but change the setting from a modern newsroom to a 1920s detective agency",
    hasContent: true,
  },
];

export function OnboardingAssistantTaskView({ node, updateAttributes }: NodeViewProps) {
  const completedTasks = node.attrs.completedTasks || [];
  const assistant = useFloatingAssistant();

  const handleTaskClick = (taskId: string, prompt: string) => {
    const newCompletedTasks = completedTasks.includes(taskId)
      ? completedTasks
      : [...completedTasks, taskId];
    updateAttributes({ completedTasks: newCompletedTasks });

    assistant.openAndSendMessage(prompt);
  };

  return (
    <NodeViewWrapper>
      <OnboardingContainer
        title={
          <>
            <BotRegular className="size-3.5" />
            <span>Try the AI Assistant</span>
          </>
        }
        progressText={`${completedTasks.length}/${TASKS.length} tasks tried`}
      >
        <div className="p-2">
          <p className="text-xs text-gray-600 mb-3">
            The AI assistant can help you organize, create, and improve your documents. Try these
            tasks:
          </p>

          {TASKS.map((task, index) => {
            const isCompleted = completedTasks.includes(task.id);
            const isFirstTask = index === 0;

            return (
              <div
                key={task.id}
                className="bg-gray-50 rounded-lg p-2.5 flex flex-col gap-y-2 mb-2 last:mb-0"
              >
                <div className="flex items-center justify-between gap-x-3">
                  <div className="flex items-start gap-x-2 flex-1">
                    <div className="p-1 bg-purple-50 rounded mt-0.5 shrink-0">
                      <SparkleRegular className="size-3.5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900">{task.title}</p>
                      <p className="text-[11px] text-gray-600 mt-0.5">{task.description}</p>
                    </div>
                  </div>
                  <Button
                    intent={isCompleted ? "secondary" : "primary"}
                    onPress={() => handleTaskClick(task.id, task.prompt)}
                    size="xs"
                    className="shrink-0"
                  >
                    {isCompleted ? "✓ Try again" : "Try it"}
                  </Button>
                </div>

                {task.hasContent && !isFirstTask && (
                  <div className="bg-white rounded-lg border border-gray-200 p-2">
                    <NodeViewContent className="outline-none prose prose-sm max-w-none text-xs" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </OnboardingContainer>
    </NodeViewWrapper>
  );
}
