import type { NodeViewRenderer } from "@tiptap/core";

import { Node } from "@tiptap/core";

export interface OnboardingAssistantTaskOptions {
  addNodeView?: () => NodeViewRenderer;
}

export const OnboardingAssistantTask = Node.create<OnboardingAssistantTaskOptions>({
  name: "onboardingAssistantTask",
  group: "block",
  content: "block+",

  addOptions() {
    return {
      addNodeView: undefined,
    };
  },

  addAttributes() {
    return {
      completedTasks: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='onboarding-assistant-task']",
        getAttrs: (node) => {
          const completedTasksAttr = (node as HTMLElement).getAttribute("data-completed-tasks");
          return {
            completedTasks: completedTasksAttr ? JSON.parse(completedTasksAttr) : [],
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "onboarding-assistant-task",
        "data-completed-tasks": JSON.stringify(node.attrs.completedTasks),
      },
      0, // 0 means "render the content here"
    ];
  },

  addNodeView() {
    return this.options.addNodeView?.();
  },
});
