export type CollectionRouteNode = {
  id: string;
  parentId: string | null;
  title: string;
  slug?: string | null;
  route?: string | null;
};

export function normalizeCollectionRoute(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw || raw === "/") {
    return "/";
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  if (collapsed === "/") {
    return "/";
  }

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

export function toCollectionRouteSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "untitled";
}

export function buildCollectionRoutes(nodes: CollectionRouteNode[]): Map<string, string> {
  const routes = new Map<string, string>();

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();

  function getNodeSegment(node: CollectionRouteNode): string {
    if (typeof node.slug === "string" && node.slug.trim().length > 0) {
      return toCollectionRouteSegment(node.slug);
    }

    return toCollectionRouteSegment(node.title || node.id);
  }

  function buildRoute(node: CollectionRouteNode): string {
    const existing = routes.get(node.id);
    if (existing) {
      return existing;
    }

    if (visiting.has(node.id)) {
      return `/${getNodeSegment(node)}`;
    }

    visiting.add(node.id);

    let computed = "/";

    if (typeof node.route === "string" && node.route.trim().length > 0) {
      computed = normalizeCollectionRoute(node.route);
    } else if (!node.parentId) {
      computed =
        typeof node.slug === "string" && node.slug.trim().length > 0
          ? `/${toCollectionRouteSegment(node.slug)}`
          : "/";
    } else {
      const parent = byId.get(node.parentId);
      const parentRoute = parent ? buildRoute(parent) : "/";
      const segment = getNodeSegment(node);
      computed = normalizeCollectionRoute(
        parentRoute === "/" ? `/${segment}` : `${parentRoute}/${segment}`,
      );
    }

    visiting.delete(node.id);
    routes.set(node.id, computed);

    return computed;
  }

  for (const node of nodes) {
    buildRoute(node);
  }

  return routes;
}
