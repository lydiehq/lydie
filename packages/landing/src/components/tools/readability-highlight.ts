import { Mark, mergeAttributes } from "@tiptap/core";

export interface ReadabilityHighlightOptions {
  type: "long-sentence" | "very-long-sentence" | "adverb" | "passive-voice" | "complex-word";
  severity: "warning" | "error";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    readabilityHighlight: {
      setReadabilityHighlight: (attributes: ReadabilityHighlightOptions) => ReturnType;
      toggleReadabilityHighlight: (attributes: ReadabilityHighlightOptions) => ReturnType;
      unsetReadabilityHighlight: () => ReturnType;
    };
  }
}

export const ReadabilityHighlight = Mark.create<ReadabilityHighlightOptions>({
  name: "readabilityHighlight",

  addOptions() {
    return {
      type: "long-sentence",
      severity: "warning",
    };
  },

  addAttributes() {
    return {
      type: {
        default: "long-sentence",
        parseHTML: (element) => element.getAttribute("data-type"),
        renderHTML: (attributes) => {
          if (!attributes.type) {
            return {};
          }
          return {
            "data-type": attributes.type,
          };
        },
      },
      severity: {
        default: "warning",
        parseHTML: (element) => element.getAttribute("data-severity"),
        renderHTML: (attributes) => {
          if (!attributes.severity) {
            return {};
          }
          return {
            "data-severity": attributes.severity,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-readability-highlight]',
        getAttrs: (node) => {
          if (typeof node === "string") return false;
          return node.hasAttribute("data-readability-highlight");
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { type, severity } = HTMLAttributes;
    const className = getHighlightClassName(type, severity);
    
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-readability-highlight": "",
        "data-type": type,
        "data-severity": severity,
        class: className,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setReadabilityHighlight:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleReadabilityHighlight:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetReadabilityHighlight:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

function getHighlightClassName(
  type: string | undefined,
  severity: string | undefined
): string {
  const baseClasses = "px-0.5 rounded";
  
  if (severity === "error") {
    if (type === "very-long-sentence") {
      return `${baseClasses} bg-red-200 text-red-900`;
    }
    return `${baseClasses} bg-red-200 text-red-900`;
  }
  
  if (type === "long-sentence") {
    return `${baseClasses} bg-yellow-200 text-yellow-900`;
  }
  
  if (type === "adverb") {
    return `${baseClasses} bg-blue-200 text-blue-900`;
  }
  
  if (type === "passive-voice") {
    return `${baseClasses} bg-green-200 text-green-900`;
  }
  
  if (type === "complex-word") {
    return `${baseClasses} bg-purple-200 text-purple-900`;
  }
  
  return `${baseClasses} bg-gray-200 text-gray-900`;
}

