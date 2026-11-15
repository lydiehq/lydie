import { describe, expect, test } from "bun:test";

import { notionIdOf, resolveHref, titleOfName } from "./names.ts";

describe("names", () => {
  test("ids and titles of exported files and folders", () => {
    expect(notionIdOf("Plan 1cebb52ee2b581a28410eac0c05420ee.html")).toBe(
      "1cebb52ee2b581a28410eac0c05420ee",
    );
    expect(notionIdOf("Habit Tracker 152bb52ee2b5804da922efa8c3194444")).toBe(
      "152bb52ee2b5804da922efa8c3194444",
    );
    expect(notionIdOf("photo.png")).toBeNull();
    expect(titleOfName("@April 7, 2025 1cebb52ee2b581a28410eac0c05420ee.html")).toBe(
      "@April 7, 2025",
    );
    expect(titleOfName("Private & Shared")).toBe("Private & Shared");
  });

  test("links resolve against the page's folder, decoded once", () => {
    expect(resolveHref("Sub%20Page%20abc.html", "Home 123")).toBe("Home 123/Sub Page abc.html");
    expect(resolveHref("../Other/Row.html", "A/B")).toBe("A/Other/Row.html");
    // Notion encodes attachment names, then the link: one decoding gives the name in the zip.
    expect(resolveHref("Page%20id/%25D0%25BA.jpg", "")).toBe("Page id/%D0%BA.jpg");
    expect(resolveHref("https://example.com/a", "")).toBeNull();
    expect(resolveHref("#heading", "")).toBeNull();
    expect(resolveHref("mailto:a@b.c", "")).toBeNull();
  });
});
