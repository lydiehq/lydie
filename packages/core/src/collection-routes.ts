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

  for (const node of nodes) {
    if (typeof node.route !== "string" || node.route.trim().length === 0) {
      continue;
    }

    routes.set(node.id, normalizeCollectionRoute(node.route));
  }

  return routes;
}
