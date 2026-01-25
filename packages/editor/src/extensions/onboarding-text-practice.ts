import { Node } from "@tiptap/core"
import type { NodeViewRenderer } from "@tiptap/core"

export interface OnboardingTextPracticeTask {
  id: string
  label: string
  completed: boolean
}

export interface OnboardingTextPracticeOptions {
  addNodeView?: () => NodeViewRenderer
}

export const OnboardingTextPractice = Node.create<OnboardingTextPracticeOptions>({
  name: "onboardingTextPractice",
  group: "block",
  content: "block+",
  isolating: true,

  addOptions() {
    return {
      addNodeView: undefined,
    }
  },

  addAttributes() {
    return {
      tasks: {
        default: [
          { id: "bold", label: "Bold some text", completed: false },
          { id: "italic", label: "Italic some text", completed: false },
          { id: "heading", label: "Create a heading", completed: false },
        ],
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='onboarding-text-practice']",
        getAttrs: (node) => ({
          tasks: JSON.parse((node as HTMLElement).getAttribute("data-tasks") || "[]"),
        }),
      },
    ]
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "onboarding-text-practice",
        "data-tasks": JSON.stringify(node.attrs.tasks),
      },
    ]
  },

  addNodeView() {
    return this.options.addNodeView?.()
  },
})
