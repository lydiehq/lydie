import { BotRegular, SparkleRegular } from "@fluentui/react-icons";
import { motion } from "motion/react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { Button } from "@/components/generic/Button";
import { useFloatingAssistant } from "@/hooks/use-floating-assistant";

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
    hasContent: false
  },
  {
    id: "change-text",
    title: "Transform a story",
    description: "See how the assistant can rewrite and adapt content",
    prompt: "Please rewrite this story but change the setting from a modern newsroom to a 1920s detective agency",
    hasContent: true
  }
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

  const allCompleted = TASKS.every(task => completedTasks.includes(task.id));

  return (
    <NodeViewWrapper>
      <motion.div className="p-1 bg-gray-100 rounded-[10px] my-4 relative">
        <div className="p-1">
          <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
            <BotRegular className="size-3.5" />
            <span>Try the AI Assistant</span>
            <span className="text-gray-500">
              {completedTasks.length}/{TASKS.length} tasks tried
            </span>
          </motion.div>
        </div>
        <div className="relative">
          <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: -2 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
            className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden absolute h-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[calc(100%-1rem)] z-0 opacity-80"
          />
          <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden relative z-10">
            <div className="p-2">
              <p className="text-xs text-gray-600 mb-3">
                The AI assistant can help you organize, create, and improve your documents. Try these tasks:
              </p>

              {TASKS.map((task, index) => {
                const isCompleted = completedTasks.includes(task.id);
                const isFirstTask = index === 0;
                
                return (
                  <div key={task.id} className="bg-gray-50 rounded-lg p-2.5 flex flex-col gap-y-2 mb-2 last:mb-0">
                    <div className="flex items-center justify-between gap-x-3">
                      <div className="flex items-start gap-x-2 flex-1">
                        <div className="p-1 bg-purple-50 rounded mt-0.5 shrink-0">
                          <SparkleRegular className="size-3.5 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900">{task.title}</p>
                          <p className="text-[11px] text-gray-600 mt-0.5">
                            {task.description}
                          </p>
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

              {allCompleted && (
                <motion.div
                  className="p-2 bg-green-50 border border-green-200 rounded-lg mt-2"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-xs font-medium text-green-800">
                    ✓ Great! You've tried all the tasks. Check the assistant panel to see the responses.
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </NodeViewWrapper>
  );
}
