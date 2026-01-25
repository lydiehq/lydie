import type { OnboardingTextPracticeTask } from "@lydie/editor/extensions";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { Checkbox } from "@/components/generic/Checkbox";

export function OnboardingTextPracticeView({ node, updateAttributes, editor }: NodeViewProps) {
  const tasks = (node.attrs.tasks || []) as OnboardingTextPracticeTask[];
  const nodeRef = useRef(node);
  nodeRef.current = node;

  useEffect(() => {
    if (!editor) return;

    const checkFormatting = () => {
      const currentNode = nodeRef.current;
      const currentTasks = (currentNode.attrs.tasks || []) as OnboardingTextPracticeTask[];
      
      const doc = editor.state.doc;
      let hasBold = false;
      let hasItalic = false;
      let hasHeading = false;

      // Find the onboardingTextPractice node in the document
      let practiceNodePos: number | null = null;
      doc.descendants((node, pos) => {
        if (node.type.name === "onboardingTextPractice") {
          practiceNodePos = pos;
          
          // Check content within this node
          node.descendants((childNode) => {
            if (childNode.marks.some((mark) => mark.type.name === "bold")) {
              hasBold = true;
            }
            if (childNode.marks.some((mark) => mark.type.name === "italic")) {
              hasItalic = true;
            }
            if (childNode.type.name === "heading") {
              hasHeading = true;
            }
          });
          
          return false; // Stop after finding our node
        }
      });

      if (practiceNodePos === null) return;

      const updatedTasks = currentTasks.map((task) => {
        if (task.id === "bold" && hasBold) {
          return { ...task, completed: true };
        }
        if (task.id === "italic" && hasItalic) {
          return { ...task, completed: true };
        }
        if (task.id === "heading" && hasHeading) {
          return { ...task, completed: true };
        }
        return task;
      });

      // Only update if there's a change
      const hasChanges = updatedTasks.some((t, i) => t.completed !== currentTasks[i]?.completed);
      if (hasChanges) {
        updateAttributes({ tasks: updatedTasks });
      }
    };

    const handleUpdate = () => {
      checkFormatting();
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, updateAttributes]);

  const completedTasks = tasks.filter((task) => task.completed).length;
  const totalTasks = tasks.length;

  return (
    <NodeViewWrapper>
      <div className="editor-content-reset rounded-xl p-6 flex flex-col gap-y-4 bg-linear-to-br from-blue-50 to-indigo-50 border border-blue-200 shadow-sm my-6">
        <div className="flex flex-col gap-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-lg text-gray-900">📝 Text Editor Practice</span>
            <span className="text-sm text-gray-600">
              {completedTasks}/{totalTasks} completed
            </span>
          </div>
          <p className="text-sm text-gray-700">
            Get familiar with basic text formatting. Try out the tasks below in the editor.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <NodeViewContent className="outline-none min-h-[120px] prose prose-sm max-w-none" />
        </div>

        <div className="flex flex-col gap-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-white/60"
            >
              <Checkbox
                isSelected={task.completed}
                onChange={() => {}}
                isDisabled={true}
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
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800">✓ Great job! You've mastered the basics!</p>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
