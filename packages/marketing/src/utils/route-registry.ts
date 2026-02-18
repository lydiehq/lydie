/**
 * Route registry for resolving document links to canonical URLs.
 *
 * This registry maps document parent slugs to their URL patterns,
 * enabling proper cross-linking between different content sections
 * (e.g., blog posts linking to resource articles and vice versa).
 */

export type RoutePattern =
  | { type: "blog"; path: `/blog/${string}` }
  | { type: "resource"; pillar: string; path: `/resources/${string}/${string}` };

interface RouteConfig {
  /** The parent document slug that identifies this route */
  parentSlug: string;
  /** The URL pattern - use :slug as placeholder */
  pattern: string;
  /** The type of route for categorization */
  type: "blog" | "resource";
  /** For resources, the pillar identifier */
  pillar?: string;
}

/**
 * Registry of parent document slugs to their URL patterns.
 *
 * When a document is a child of one of these parents, its links
 * will be resolved using the corresponding pattern.
 */
const ROUTE_REGISTRY: RouteConfig[] = [
  // Blog posts - children of the "blog" parent document
  { parentSlug: "blog", pattern: "/blog/:slug", type: "blog" },

  // Resource hub articles
  {
    parentSlug: "knowledge-bases",
    pattern: "/resources/knowledge-bases/:slug",
    type: "resource",
    pillar: "knowledge-bases",
  },
  {
    parentSlug: "note-taking",
    pattern: "/resources/note-taking/:slug",
    type: "resource",
    pillar: "note-taking",
  },
  // Add more resource pillars here as needed
];

/**
 * Resolves a document slug to its canonical URL based on its parent.
 *
 * @param slug - The document slug
 * @param parentSlug - The parent document's slug (determines the route)
 * @returns The canonical URL path, or null if no route matches
 *
 * @example
 * resolveLink("my-article", "blog") // returns "/blog/my-article"
 * resolveLink("getting-started", "knowledge-bases") // returns "/resources/knowledge-bases/getting-started"
 */
export function resolveLink(slug: string, parentSlug?: string): string | null {
  if (!parentSlug) {
    return null;
  }

  const route = ROUTE_REGISTRY.find((r) => r.parentSlug === parentSlug);

  if (!route) {
    console.warn(`[RouteRegistry] Unknown parent slug "${parentSlug}" for document "${slug}"`);
    return null;
  }

  return route.pattern.replace(":slug", slug);
}

/**
 * Creates a link resolver function for use with content renderers.
 *
 * @returns A link resolver that can be passed to LydieContent or renderContent
 *
 * @example
 * import { createLinkResolver } from "@/utils/route-registry";
 *
 * <LydieContent
 *   content={document.jsonContent}
 *   linkResolver={createLinkResolver()}
 * />
 */
export function createLinkResolver(): (ref: {
  href: string;
  id?: string;
  slug?: string;
  title?: string;
  parentSlug?: string;
  type?: "internal" | "external";
}) => string {
  return (ref) => {
    // External links pass through
    if (ref.type === "external") {
      return ref.href;
    }

    // Internal links - resolve based on parent slug
    if (ref.type === "internal" && ref.slug) {
      const resolved = resolveLink(ref.slug, ref.parentSlug);
      if (resolved) {
        return resolved;
      }
    }

    // Fallback to href or anchor
    return ref.href || "#";
  };
}

/**
 * Gets route information for a parent slug.
 *
 * @param parentSlug - The parent document slug
 * @returns The route configuration, or null if not found
 */
export function getRouteInfo(parentSlug: string): RouteConfig | null {
  return ROUTE_REGISTRY.find((r) => r.parentSlug === parentSlug) || null;
}

/**
 * Checks if a parent slug is a valid route in the registry.
 *
 * @param parentSlug - The parent document slug to check
 */
export function isValidRoute(parentSlug: string): boolean {
  return ROUTE_REGISTRY.some((r) => r.parentSlug === parentSlug);
}
