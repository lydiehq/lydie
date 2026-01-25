import { Link as TiptapLink } from "@tiptap/extension-link";

export const Link = TiptapLink.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
      },
      target: {
        default: this.options.HTMLAttributes.target,
      },
      rel: {
        default: this.options.HTMLAttributes.rel,
      },
      class: {
        default: this.options.HTMLAttributes.class,
      },
      "data-internal": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-internal"),
        renderHTML: (attributes) => {
          if (attributes.href?.startsWith("internal://")) {
            return {
              "data-internal": "",
            };
          }
          return {};
        },
      },
    };
  },
});
