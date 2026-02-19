export type CollectionRouteNode = {
  id: string;
  parentId: string | null;
  title: string;
  slug?: string | null;
};

export function normalizeCollectionRoute(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw || raw === "/") {
    return "/";
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
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

function getCollectionRouteSegment(document: CollectionRouteNode): string {
  if (typeof document.slug === "string" && document.slug.trim().length > 0) {
    return toCollectionRouteSegment(document.slug);
  }

  if (document.title.trim().length > 0) {
    return toCollectionRouteSegment(document.title);
  }

  return document.id;
}

export function buildCollectionRoutes(nodes: CollectionRouteNode[]): Map<string, string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const memo = new Map<string, string>();

  const resolve = (nodeId: string, visited: Set<string> = new Set()): string => {
    const cached = memo.get(nodeId);
    if (cached) {
      return cached;
    }

    const node = byId.get(nodeId);
    if (!node) {
      return "/";
    }

    if (visited.has(nodeId)) {
      return "/";
    }
    visited.add(nodeId);

    const segment = getCollectionRouteSegment(node);
    const parent = node.parentId ? byId.get(node.parentId) : null;

    let route: string;
    if (!parent) {
      route = segment === "index" ? "/" : `/${segment}`;
    } else {
      const parentRoute = resolve(parent.id, visited);
      route =
        segment === "index"
          ? parentRoute
          : parentRoute === "/"
            ? `/${segment}`
            : `${parentRoute}/${segment}`;
    }

    const normalized = normalizeCollectionRoute(route);
    memo.set(nodeId, normalized);
    return normalized;
  };

  for (const node of nodes) {
    resolve(node.id);
  }

  return memo;
}
