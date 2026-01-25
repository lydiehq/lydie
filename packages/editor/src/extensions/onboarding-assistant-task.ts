import { Node } from "@tiptap/core"
import type { NodeViewRenderer } from "@tiptap/core"

export interface OnboardingAssistantTaskOptions {
  addNodeView?: () => NodeViewRenderer
}

export const OnboardingAssistantTask = Node.create<OnboardingAssistantTaskOptions>({
  name: "onboardingAssistantTask",
  group: "block",
  atom: true,

  addOptions() {
    return {
      addNodeView: undefined,
    }
  },

  addAttributes() {
    return {
      completed: {
        default: false,
      },
      prompt: {
        default: "Please look at all our documents related to project apollo and organize them",
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='onboarding-assistant-task']",
        getAttrs: (node) => ({
          completed: (node as HTMLElement).getAttribute("data-completed") === "true",
          prompt: (node as HTMLElement).getAttribute("data-prompt") || "Please look at all our documents related to project apollo and organize them",
        }),
      },
    ]
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "onboarding-assistant-task",
        "data-completed": String(node.attrs.completed),
        "data-prompt": node.attrs.prompt,
      },
    ]
  },

  addNodeView() {
    return this.options.addNodeView?.()
  },
})
