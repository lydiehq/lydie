import { Node } from "@tiptap/core"
import type { NodeViewRenderer } from "@tiptap/core"

export interface OnboardingPlaceholderOptions {
  addNodeView?: () => NodeViewRenderer
}

export const OnboardingPlaceholder = Node.create<OnboardingPlaceholderOptions>({
  name: "onboardingPlaceholder",
  group: "block",
  atom: true,

  addOptions() {
    return {
      addNodeView: undefined,
    }
  },

  addAttributes() {
    return {
      title: {
        default: "Coming Soon",
      },
      description: {
        default: "This onboarding step will be available soon.",
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='onboarding-placeholder']",
        getAttrs: (node) => ({
          title: (node as HTMLElement).getAttribute("data-title") || "Coming Soon",
          description: (node as HTMLElement).getAttribute("data-description") || "This onboarding step will be available soon.",
        }),
      },
    ]
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "onboarding-placeholder",
        "data-title": node.attrs.title,
        "data-description": node.attrs.description,
      },
    ]
  },

  addNodeView() {
    return this.options.addNodeView?.()
  },
})
