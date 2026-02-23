import { describe, expect, it } from "vitest";

import { resolveSelectedViewId } from "./view-selection";

describe("resolveSelectedViewId", () => {
  const views = [
    { id: "view-table", name: "Table", type: "table" as const },
    { id: "view-kanban", name: "Board", type: "kanban" as const },
  ];

  it("keeps current view when it still exists", () => {
    expect(resolveSelectedViewId("view-kanban", views)).toBe("view-kanban");
  });

  it("falls back to first view when current selection is missing", () => {
    expect(resolveSelectedViewId("missing-view", views)).toBe("view-table");
  });

  it("returns null when there are no views", () => {
    expect(resolveSelectedViewId("anything", [])).toBeNull();
  });
});
