import { Node } from "@tiptap/core"
import type { NodeViewRenderer } from "@tiptap/core"

export interface OnboardingCalloutOptions {
  addNodeView?: () => NodeViewRenderer
}

export const OnboardingCallout = Node.create<OnboardingCalloutOptions>({
  name: "onboardingCallout",
  group: "block",
  atom: true,

  addOptions() {
    return {
      addNodeView: undefined,
    }
  },

  addAttributes() {
    return {
      type: {
        default: "tip",
      },
      icon: {
        default: "lightbulb",
      },
      title: {
        default: "",
      },
      content: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='onboarding-callout']",
        getAttrs: (node) => ({
          type: (node as HTMLElement).getAttribute("data-callout-type") || "tip",
          icon: (node as HTMLElement).getAttribute("data-icon") || "lightbulb",
          title: (node as HTMLElement).getAttribute("data-title") || "",
          content: (node as HTMLElement).getAttribute("data-content") || "",
        }),
      },
    ]
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "onboarding-callout",
        "data-callout-type": node.attrs.type,
        "data-icon": node.attrs.icon,
        "data-title": node.attrs.title,
        "data-content": node.attrs.content,
      },
    ]
  },

  addNodeView() {
    return this.options.addNodeView?.()
  },
})
