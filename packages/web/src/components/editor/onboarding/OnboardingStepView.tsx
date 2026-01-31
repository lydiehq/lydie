import type { OnboardingStepTask } from "@lydie/editor/extensions";

import { Button } from "@lydie/ui/components/generic/Button";
import { Checkbox } from "@lydie/ui/components/generic/Checkbox";
import { CircularProgress } from "@lydie/ui/components/generic/CircularProgress";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function OnboardingStepView({ node, updateAttributes }: NodeViewProps) {
  const stepNumber = node.attrs.stepNumber || 1;
  const title = node.attrs.title || "";
  const description = node.attrs.description || "";
  const tasks = (node.attrs.tasks || []) as OnboardingStepTask[];

  const completedTasks = tasks.filter((task) => task.completed).length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const handleTaskToggle = (taskId: string) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, completed: !task.completed } : task,
    );
    updateAttributes({ tasks: updatedTasks });
  };

  return (
    <NodeViewWrapper>
      <div className="editor-content-reset rounded-xl p-2 flex flex-col gap-y-2 bg-white shadow-surface">
        <div className="flex flex-col gap-y-1">
          <span className="font-medium text-sm text-gray-900">Assistant</span>
          <p className="text-sm/relaxed text-gray-500">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Explicabo fuga dolorum saepe
            error velit nemo, ad nisi nulla illum at.
          </p>
        </div>

        <ul>
          {[...Array(3)].map(() => (
            <li className="bg-gray-100 w-full p-3 rounded-lg flex justify-between items-center">
              <div></div>
              <Button>Sup</Button>
            </li>
          ))}
        </ul>
      </div>
    </NodeViewWrapper>
  );

  return (
    <NodeViewWrapper className="my-6">
      <div className="rounded-xl bg-linear-to-br from-blue-50 to-indigo-50 border border-blue-200 overflow-hidden shadow-sm">
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                {stepNumber}
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
              {description && <p className="text-sm text-gray-600">{description}</p>}
            </div>
            <div className="shrink-0">
              <CircularProgress progress={progress} size={40} progressColor="#3b82f6" />
            </div>
          </div>

          <div className="space-y-3 mt-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-white/60 hover:bg-white/80 transition-colors"
              >
                <Checkbox
                  isSelected={task.completed}
                  onChange={() => handleTaskToggle(task.id)}
                  className="mt-0.5"
                >
                  <span className={task.completed ? "line-through text-gray-500" : "text-gray-700"}>
                    {task.label}
                  </span>
                </Checkbox>
              </div>
            ))}
          </div>

          {completedTasks === totalTasks && totalTasks > 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">✓ Step completed! Great job!</p>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
