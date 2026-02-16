import { Link as TiptapLink } from "@tiptap/extension-link";
import { registerCustomProtocol } from "linkifyjs";

registerCustomProtocol("internal");

export const Link = TiptapLink.extend({
  onDestroy() {},

  addAttributes() {
    return {
      ...this.parent?.(),
      href: { default: null },
      target: { default: this.options.HTMLAttributes.target },
      rel: { default: this.options.HTMLAttributes.rel },
      class: { default: this.options.HTMLAttributes.class },
      kind: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-kind"),
        renderHTML: (attributes) =>
          attributes.kind ? { "data-kind": attributes.kind } : {},
      },
      refId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-ref-id"),
        renderHTML: (attributes) =>
          attributes.refId ? { "data-ref-id": attributes.refId } : {},
      },
    };
  },
});

export function isInternalLink(href: string): boolean {
  return href.startsWith("/");
}

export function extractDocumentIdFromInternalLink(href: string): string | null {
  return href.startsWith("/") ? href.replace(/^\//, "") : null;
}

export function createInternalLinkAttrs(refId: string, slug: string) {
  return {
    kind: "internal",
    refId,
    href: `/${slug}`,
  };
}
