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
        renderHTML: (attributes) => (attributes.kind ? { "data-kind": attributes.kind } : {}),
      },
      refId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-ref-id"),
        renderHTML: (attributes) => (attributes.refId ? { "data-ref-id": attributes.refId } : {}),
      },
      moduleId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-module-id"),
        renderHTML: (attributes) =>
          attributes.moduleId ? { "data-module-id": attributes.moduleId } : {},
      },
      slug: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-slug"),
        renderHTML: (attributes) => (attributes.slug ? { "data-slug": attributes.slug } : {}),
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

export function createInternalLinkAttrs(refId: string, slug: string, moduleId?: string) {
  return {
    kind: "internal",
    refId,
    slug,
    moduleId: moduleId || null,
    href: `/${slug}`,
  };
}

// Internal link node structure for modules
export type InternalLinkNode = {
  type: "internal";
  documentId: string;
  moduleId: string; // denormalized at insertion time
  slug: string; // denormalized at insertion time
};

// Link resolver for generating public URLs
export function linkResolver(link: InternalLinkNode, moduleRoutes: Record<string, string>): string {
  const prefix = moduleRoutes[link.moduleId] ?? "";
  return `${prefix}/${link.slug}`;
}
