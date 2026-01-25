import { BotRegular, SparkleRegular } from "@fluentui/react-icons";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { Button } from "@/components/generic/Button";
import { useFloatingAssistant } from "@/hooks/use-floating-assistant";

export function OnboardingAssistantTaskView({ node, updateAttributes }: NodeViewProps) {
  const completed = node.attrs.completed || false;
  const prompt = node.attrs.prompt || "Please look at all our documents related to project apollo and organize them";
  const assistant = useFloatingAssistant();

  const handleClick = () => {
    updateAttributes({ completed: true });
    assistant.openAndSendMessage(prompt);
  };

  return (
    <NodeViewWrapper>
      <div className="editor-content-reset rounded-xl p-6 flex flex-col gap-y-4 bg-linear-to-br from-purple-50 to-pink-50 border border-purple-200 shadow-sm my-6">
        <div className="flex items-center gap-x-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <BotRegular className="size-5 text-purple-600" />
          </div>
          <span className="text-lg font-semibold text-gray-900">🤖 Try the AI Assistant</span>
        </div>

        <p className="text-sm text-gray-700">
          The AI assistant can help you organize, create, and improve your documents. Click the button below to try it out.
        </p>

        <div className="bg-white/60 rounded-lg p-4 flex items-center justify-between gap-x-4">
          <div className="flex items-start gap-x-3 flex-1">
            <div className="p-1.5 bg-purple-50 rounded mt-0.5">
              <SparkleRegular className="size-4 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Organize Project Apollo documents</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Ask the assistant to help organize demo documents
              </p>
            </div>
          </div>
          <Button
            intent={completed ? "secondary" : "primary"}
            onPress={handleClick}
            size="sm"
          >
            {completed ? "✓ Try again" : "Try it"}
          </Button>
        </div>

        {completed && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800">
              ✓ Great! Check the assistant panel to see the response.
            </p>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
