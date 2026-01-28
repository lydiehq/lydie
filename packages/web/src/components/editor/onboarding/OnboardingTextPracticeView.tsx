import type { OnboardingTextPracticeTask } from "@lydie/editor/extensions";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";

import { Checkbox } from "@lydie/ui/components/generic/Checkbox";

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
  const allCompleted = completedTasks === totalTasks && totalTasks > 0;

  return (
    <NodeViewWrapper>
      <motion.div className="p-1 bg-gray-100 rounded-[10px] my-4 relative">
        <div className="p-1">
          <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
            <span>📝 Text Editor Practice</span>
            <span className="text-gray-500">
              {completedTasks}/{totalTasks} completed
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
              <NodeViewContent className="outline-none min-h-[80px] prose prose-sm max-w-none text-xs" />
              <div className="flex flex-col gap-y-1.5 mb-2">
                {tasks.map((task) => {
                  let label = task.label;
                  // Update heading task to urge using the slash menu
                  if (task.id === "heading") {
                    label = "Create a heading (type / to open menu)";
                  }

                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-gray-50/60"
                    >
                      <Checkbox
                        isSelected={task.completed}
                        onChange={() => {}}
                        isDisabled={true}
                        className="mt-0.5"
                      >
                        <span
                          className={
                            task.completed
                              ? "line-through text-gray-500 text-xs"
                              : "text-gray-700 text-xs"
                          }
                        >
                          {label}
                        </span>
                      </Checkbox>
                    </div>
                  );
                })}
              </div>

              {allCompleted && (
                <motion.div
                  className="p-2 bg-green-50 border border-green-200 rounded-lg"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-xs font-medium text-green-800">
                    ✓ Great job! You've mastered the basics!
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
