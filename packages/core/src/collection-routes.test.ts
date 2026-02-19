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
  it("should build routes for flat structure", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Home", slug: "index" },
      { id: "2", parentId: null, title: "About", slug: "about" },
      { id: "3", parentId: null, title: "Contact", slug: "contact" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/");
    expect(routes.get("2")).toBe("/about");
    expect(routes.get("3")).toBe("/contact");
  });

  it("should build routes for nested structure", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Docs", slug: "docs" },
      { id: "2", parentId: "1", title: "Getting Started", slug: "getting-started" },
      { id: "3", parentId: "2", title: "Installation", slug: "installation" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/docs");
    expect(routes.get("2")).toBe("/docs/getting-started");
    expect(routes.get("3")).toBe("/docs/getting-started/installation");
  });

  it("should handle missing slugs using titles", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "My Page", slug: null },
      { id: "2", parentId: null, title: "Another Page", slug: undefined },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/my-page");
    expect(routes.get("2")).toBe("/another-page");
  });

  it("should handle missing titles using IDs", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "doc-123", parentId: null, title: "", slug: null },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("doc-123")).toBe("/doc-123");
  });

  it("should handle empty node list", () => {
    const routes = buildCollectionRoutes([]);
    expect(routes.size).toBe(0);
  });

  it("should handle index pages at root", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Home", slug: "index" },
      { id: "2", parentId: null, title: "Products", slug: "products" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/");
    expect(routes.get("2")).toBe("/products");
  });

  it("should handle index pages in nested structure", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Products", slug: "products" },
      { id: "2", parentId: "1", title: "Overview", slug: "index" },
      { id: "3", parentId: "1", title: "Features", slug: "features" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/products");
    expect(routes.get("2")).toBe("/products");
    expect(routes.get("3")).toBe("/products/features");
  });

  it("should handle circular references gracefully", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: "2", title: "Page 1", slug: "page-1" },
      { id: "2", parentId: "1", title: "Page 2", slug: "page-2" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/");
    expect(routes.get("2")).toBe("/");
  });

  it("should handle missing parent references", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Root", slug: "root" },
      { id: "2", parentId: "999", title: "Orphan", slug: "orphan" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/root");
    expect(routes.get("2")).toBe("/orphan");
  });

  it("should memoize route calculations", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Parent", slug: "parent" },
      { id: "2", parentId: "1", title: "Child", slug: "child" },
      { id: "3", parentId: "1", title: "Another Child", slug: "another-child" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("2")).toBe("/parent/child");
    expect(routes.get("3")).toBe("/parent/another-child");
  });

  it("should handle complex tree structure", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "Root", slug: "root" },
      { id: "2", parentId: "1", title: "Branch A", slug: "branch-a" },
      { id: "3", parentId: "1", title: "Branch B", slug: "branch-b" },
      { id: "4", parentId: "2", title: "Leaf A1", slug: "leaf-a1" },
      { id: "5", parentId: "2", title: "Leaf A2", slug: "leaf-a2" },
      { id: "6", parentId: "3", title: "Leaf B1", slug: "leaf-b1" },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/root");
    expect(routes.get("2")).toBe("/root/branch-a");
    expect(routes.get("3")).toBe("/root/branch-b");
    expect(routes.get("4")).toBe("/root/branch-a/leaf-a1");
    expect(routes.get("5")).toBe("/root/branch-a/leaf-a2");
    expect(routes.get("6")).toBe("/root/branch-b/leaf-b1");
  });

  it("should handle titles with special characters", () => {
    const nodes: CollectionRouteNode[] = [
      { id: "1", parentId: null, title: "FAQ & Help!", slug: null },
      { id: "2", parentId: null, title: "What's New?", slug: null },
    ];

    const routes = buildCollectionRoutes(nodes);

    expect(routes.get("1")).toBe("/faq-help");
    expect(routes.get("2")).toBe("/whats-new");
  });
});
