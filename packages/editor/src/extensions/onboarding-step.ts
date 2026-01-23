import { Node } from "@tiptap/core"
import type { NodeViewRenderer } from "@tiptap/core"

export interface OnboardingStepTask {
  id: string
  label: string
  completed: boolean
}

export interface OnboardingStepOptions {
  addNodeView?: () => NodeViewRenderer
}

export const OnboardingStep = Node.create<OnboardingStepOptions>({
  name: "onboardingStep",
  group: "block",
  atom: true,

  addOptions() {
    return {
      addNodeView: undefined,
    }
  },

  addAttributes() {
    return {
      stepNumber: {
        default: 1,
      },
      title: {
        default: "",
      },
      description: {
        default: "",
      },
      tasks: {
        default: [],
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='onboarding-step']",
        getAttrs: (node) => ({
          stepNumber: Number((node as HTMLElement).getAttribute("data-step-number")) || 1,
          title: (node as HTMLElement).getAttribute("data-title") || "",
          description: (node as HTMLElement).getAttribute("data-description") || "",
          tasks: JSON.parse((node as HTMLElement).getAttribute("data-tasks") || "[]"),
        }),
      },
    ]
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "onboarding-step",
        "data-step-number": node.attrs.stepNumber,
        "data-title": node.attrs.title,
        "data-description": node.attrs.description,
        "data-tasks": JSON.stringify(node.attrs.tasks),
      },
    ]
  },

  addNodeView() {
    return this.options.addNodeView?.()
  },
})
