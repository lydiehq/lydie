import { describe, expect, test } from "bun:test";

import {
  COVER_COLORS,
  coverFillOf,
  isPageOptionKey,
  pageCoverOf,
  pageFullWidthOf,
  userPropertyEntries,
} from "./page-icon.tsx";

describe("page options", () => {
  test("are not the page's properties", () => {
    for (const key of ["icon", "cover", "cover-position", "full-width"])
      expect(isPageOptionKey(key)).toBe(true);
    expect(isPageOptionKey("Icon")).toBe(false);
    expect(
      userPropertyEntries({
        icon: "👋",
        status: "Done",
        cover: "blue",
        "cover-position": 30,
        "full-width": true,
        tags: ["a"],
      }),
    ).toEqual([
      ["status", "Done"],
      ["tags", ["a"]],
    ]);
    expect(userPropertyEntries(null)).toEqual([]);
  });
});

describe("full width", () => {
  test("on only when the property says so", () => {
    for (const value of [true, "true", "yes"])
      expect(pageFullWidthOf({ "full-width": value })).toBe(true);
    for (const value of [false, "false", "no", 1, null, undefined])
      expect(pageFullWidthOf({ "full-width": value })).toBe(false);
    expect(pageFullWidthOf(null)).toBe(false);
  });
});

describe("cover colours", () => {
  test("a palette name is painted by its class", () => {
    expect(coverFillOf("blue")).toEqual({ className: COVER_COLORS.blue });
    expect(coverFillOf(" Blue ")).toEqual({ className: COVER_COLORS.blue });
  });

  test("a hex colour is painted as written", () => {
    expect(coverFillOf("#E8D5C4")).toEqual({
      className: "",
      style: { backgroundColor: "#e8d5c4" },
    });
    expect(coverFillOf("#abc")?.style).toEqual({ backgroundColor: "#abc" });
  });

  test("images are not colours", () => {
    for (const cover of ["banner.png", "blue.png", "https://example.com/a.jpg", "#12", "", null])
      expect(coverFillOf(cover)).toBeNull();
    // An object key that is not a colour.
    expect(coverFillOf("constructor")).toBeNull();
  });

  test("pageCoverOf keeps a colour cover as written", () => {
    expect(pageCoverOf({ cover: "green" })).toEqual({ cover: "green", position: 50 });
  });
});
