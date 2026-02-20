import { describe, expect, it } from "vitest";

import {
  buildCollectionRoutes,
  normalizeCollectionRoute,
  toCollectionRouteSegment,
  type CollectionRouteNode,
} from "./collection-routes";

describe("normalizeCollectionRoute", () => {
  it("should normalize root path", () => {
    expect(normalizeCollectionRoute("/")).toBe("/");
    expect(normalizeCollectionRoute("")).toBe("/");
    expect(normalizeCollectionRoute(null)).toBe("/");
    expect(normalizeCollectionRoute(undefined)).toBe("/");
  });

  it("should add leading slash", () => {
    expect(normalizeCollectionRoute("about")).toBe("/about");
    expect(normalizeCollectionRoute("docs/getting-started")).toBe("/docs/getting-started");
  });

  it("should preserve existing leading slash", () => {
    expect(normalizeCollectionRoute("/about")).toBe("/about");
    expect(normalizeCollectionRoute("/docs/guide")).toBe("/docs/guide");
  });

  it("should collapse multiple slashes", () => {
    expect(normalizeCollectionRoute("//about")).toBe("/about");
    expect(normalizeCollectionRoute("/docs//guide")).toBe("/docs/guide");
    expect(normalizeCollectionRoute("///")).toBe("/");
  });

  it("should remove trailing slash", () => {
    expect(normalizeCollectionRoute("/about/")).toBe("/about");
    expect(normalizeCollectionRoute("/docs/guide/")).toBe("/docs/guide");
  });

  it("should trim whitespace", () => {
    expect(normalizeCollectionRoute("  /about  ")).toBe("/about");
    expect(normalizeCollectionRoute("  about  ")).toBe("/about");
  });
});

describe("toCollectionRouteSegment", () => {
  it("should convert to lowercase", () => {
    expect(toCollectionRouteSegment("About")).toBe("about");
    expect(toCollectionRouteSegment("GETTING-STARTED")).toBe("getting-started");
  });

  it("should replace spaces with hyphens", () => {
    expect(toCollectionRouteSegment("getting started")).toBe("getting-started");
    expect(toCollectionRouteSegment("my page title")).toBe("my-page-title");
  });

  it("should remove special characters", () => {
    expect(toCollectionRouteSegment("about!")).toBe("about");
    expect(toCollectionRouteSegment("page@home#")).toBe("pagehome");
    expect(toCollectionRouteSegment("100%")).toBe("100");
  });

  it("should collapse multiple hyphens", () => {
    expect(toCollectionRouteSegment("page--title")).toBe("page-title");
    expect(toCollectionRouteSegment("my---page")).toBe("my-page");
  });

  it("should trim leading/trailing hyphens", () => {
    expect(toCollectionRouteSegment("-about-")).toBe("about");
    expect(toCollectionRouteSegment("--page--")).toBe("page");
  });

  it("should return 'untitled' for empty strings", () => {
    expect(toCollectionRouteSegment("")).toBe("untitled");
    expect(toCollectionRouteSegment("!!!")).toBe("untitled");
    expect(toCollectionRouteSegment("   ")).toBe("untitled");
  });

  it("should handle valid segments", () => {
    expect(toCollectionRouteSegment("my-page")).toBe("my-page");
    expect(toCollectionRouteSegment("page123")).toBe("page123");
  });
});

describe("buildCollectionRoutes", () => {
  it("should include explicit routes", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Home", route: "/" },
      { id: "2", parentId: null, title: "About", route: "/about" },
      { id: "3", parentId: null, title: "Contact", route: "contact" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/");
    expect(routes.get("2")).toBe("/about");
    expect(routes.get("3")).toBe("/contact");
  });

  it("should infer routes from hierarchy when explicit route is missing", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Docs", slug: "docs", route: null },
      { id: "2", parentId: "1", title: "Getting Started", slug: "getting-started" },
      { id: "3", parentId: "2", title: "Installation", route: "   " },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/docs");
    expect(routes.get("2")).toBe("/docs/getting-started");
    expect(routes.get("3")).toBe("/docs/getting-started/installation");
  });

  it("should normalize explicit route values", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "My Page", route: "  /docs//intro/  " },
      { id: "2", parentId: null, title: "Another Page", route: "" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/docs/intro");
    expect(routes.get("2")).toBe("/");
  });

  it("should map a top-level node without slug to root", () => {
    const nodes: CollectionRouteNode[] = [{ id: "1", parentId: null, title: "Home" }];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/");
  });

  it("should handle empty node list", () => {
    const routes = buildCollectionRoutes([]);
    expect(routes.size).toBe(0);
  });
});
