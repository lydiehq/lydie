import { describe, expect, test } from "bun:test";

import type { ViewConfig } from "@lydie/plugin-api/databases";

import {
  changesRows,
  isEmptyOverlay,
  mergeOverlay,
  overlayStorageKey,
  patchOverlay,
  pruneOverlay,
  sameJson,
} from "./overlay.ts";

const saved: ViewConfig = {
  filter: null,
  sorts: [],
  groupBy: null,
  subGroupBy: null,
  columns: [],
  limit: null,
  summaries: {},
  layout: {},
  extra: {},
};

const sortByPoints = [{ propertyId: "P1", direction: "desc" as const }];

describe("view overlays", () => {
  test("storage keys: one per view, one per embed of it", () => {
    expect(overlayStorageKey("V1")).toBe("overlay:V1");
    expect(overlayStorageKey("V1", "D1:Tasks.base")).toBe("overlay:V1:embed:D1:Tasks.base");
    expect(overlayStorageKey("V1", null)).toBe("overlay:V1");
  });

  test("a patch goes to the overlay; the saved view is untouched", () => {
    const { overlay, shared } = patchOverlay(saved, {}, { sorts: sortByPoints });
    expect(overlay).toEqual({ sorts: sortByPoints });
    expect(shared).toEqual({});
    expect(saved.sorts).toEqual([]);
    expect(mergeOverlay(saved, overlay).sorts).toEqual(sortByPoints);
  });

  test("keys that are not view state stay shared", () => {
    const { overlay, shared } = patchOverlay(saved, {}, { extra: { a: 1 }, limit: 5 });
    expect(overlay).toEqual({ limit: 5 });
    expect(shared).toEqual({ extra: { a: 1 } });
  });

  test("a change back to the saved value drops the key (no longer edited)", () => {
    const first = patchOverlay(saved, {}, { sorts: sortByPoints }).overlay;
    const back = patchOverlay(saved, first, { sorts: [] }).overlay;
    expect(isEmptyOverlay(back)).toBe(true);
  });

  test("merging an empty overlay keeps the saved object", () => {
    expect(mergeOverlay(saved, {})).toBe(saved);
  });

  test("saved underneath: the overlay's keys win, the rest follows the new saved view", () => {
    const overlay = patchOverlay(saved, {}, { sorts: sortByPoints }).overlay;
    const theirs: ViewConfig = {
      ...saved,
      sorts: [{ propertyId: "P2", direction: "asc" }],
      groupBy: { propertyId: "P3", direction: "asc" },
    };
    const merged = mergeOverlay(theirs, pruneOverlay(theirs, overlay));
    expect(merged.sorts).toEqual(sortByPoints);
    expect(merged.groupBy).toEqual({ propertyId: "P3", direction: "asc" });
  });

  test("saved for everyone: the overlay matches the saved view and empties", () => {
    const overlay = patchOverlay(saved, {}, { sorts: sortByPoints, limit: 10 }).overlay;
    const after: ViewConfig = { ...saved, ...overlay };
    expect(isEmptyOverlay(pruneOverlay(after, overlay))).toBe(true);
  });

  test("stored garbage is ignored", () => {
    expect(pruneOverlay(saved, null)).toEqual({});
    expect(pruneOverlay(saved, [1, 2])).toEqual({});
    expect(pruneOverlay(saved, { nonsense: 1, sorts: sortByPoints })).toEqual({
      sorts: sortByPoints,
    });
  });

  test("filter and grouping change what new pages need", () => {
    expect(changesRows({ sorts: sortByPoints })).toBe(false);
    expect(changesRows({ filter: null })).toBe(true);
    expect(changesRows({ groupBy: null })).toBe(true);
  });

  test("sameJson ignores key order and treats missing as undefined", () => {
    expect(sameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson([1], { 0: 1 })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
  });
});
