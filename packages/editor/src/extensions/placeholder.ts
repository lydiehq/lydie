import { Mark } from "@tiptap/core";

export interface PlaceholderOptions {
  HTMLAttributes?: Record<string, string>;
}

export interface PlaceholderAttributes {
  label: string;
  filled?: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    placeholder: {
      /**
       * Set a placeholder mark
       */
      setPlaceholder: (attributes: PlaceholderAttributes) => ReturnType;
      /**
       * Toggle a placeholder mark
       */
      togglePlaceholder: (attributes: PlaceholderAttributes) => ReturnType;
      /**
       * Unset a placeholder mark
       */
      unsetPlaceholder: () => ReturnType;
      /**
       * Insert a placeholder at the current position
       */
      insertPlaceholder: (attributes: PlaceholderAttributes) => ReturnType;
    };
  }
}

export const Placeholder = Mark.create<PlaceholderOptions>({
  name: "fieldPlaceholder",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") || "",
        renderHTML: (attributes) => {
          if (!attributes.label) {
            return {};
          }
          return {
            "data-label": attributes.label,
          };
        },
      },
      filled: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-filled") === "true",
        renderHTML: (attributes) => {
          if (!attributes.filled) {
            return {};
          }
          return {
            "data-filled": "true",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-placeholder]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-placeholder": "",
        class: `placeholder ${HTMLAttributes.filled ? "placeholder--filled" : "placeholder--empty"}`,
        ...HTMLAttributes,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setPlaceholder:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      togglePlaceholder:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetPlaceholder:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      insertPlaceholder:
        (attributes) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: "text",
              text: attributes.label,
              marks: [
                {
                  type: this.name,
                  attrs: {
                    label: attributes.label,
                    filled: false,
                  },
                },
              ],
            })
            .run();
        },
    };
  },
});
