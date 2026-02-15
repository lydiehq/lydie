import { Link as TiptapLink } from "@tiptap/extension-link";
import { registerCustomProtocol } from "linkifyjs";

// Register the internal protocol at module load time to avoid
// "already initialized" warnings when editors are destroyed/recreated.
// This must happen before any Link extension instances are created.
registerCustomProtocol("internal");

export const Link = TiptapLink.extend({
  // Override onDestroy to prevent calling reset(), which would clear
  // the registered protocols and cause warnings on subsequent editor
  // creations. We manage protocol registration at the module level.
  onDestroy() {
    // Intentionally not calling this.parent?.() to avoid reset()
  },

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
