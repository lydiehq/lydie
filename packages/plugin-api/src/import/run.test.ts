// The pure parts of writing an import; `runImport` itself runs against a real backend in
// @lydie/app (src/backend/import.test.ts).
import { describe, expect, test } from "bun:test";

import { importDatabaseEmbed, importFileRef, importLink, newImportId } from "./plan.ts";
import {
  importTitle,
  linkTargets,
  resolvePlaceholders,
  uniqueFileName,
  uniqueName,
} from "./run.ts";

describe("import writing", () => {
  test("titles", () => {
    expect(importTitle("  Two\nlines  ")).toBe("Two lines");
    expect(importTitle("   ")).toBe("Untitled");
    expect(importTitle("x".repeat(300))).toHaveLength(255);
  });

  test("names get a number when taken, ignoring case", () => {
    const taken = new Set(["notion"]);
    expect(uniqueName("Notion", taken)).toBe("Notion 2");
    expect(uniqueName("Notion", taken)).toBe("Notion 3");
    const files = new Set(["photo.png"]);
    expect(uniqueFileName("Photo.png", files)).toBe("Photo 2.png");
    expect(uniqueFileName("a|b#c.pdf", files)).toBe("a-b-c.pdf");
    expect(uniqueFileName("README", files)).toBe("README");
  });

  test("links by path, or by id when the path is not unique or cannot be written", () => {
    const root = { id: newImportId(), title: "Notion" };
    const a = { id: newImportId(), parentId: null, title: "Projects" };
    const b = { id: newImportId(), parentId: a.id, title: "Plan" };
    const c1 = { id: newImportId(), parentId: a.id, title: "Untitled" };
    const c2 = { id: newImportId(), parentId: a.id, title: "untitled" };
    const d = { id: newImportId(), parentId: null, title: "Q1/Q2 #goals" };
    const targets = linkTargets([a, b, c1, c2, d], root);
    expect(targets.get(a.id)).toBe("Notion/Projects");
    expect(targets.get(b.id)).toBe("Notion/Projects/Plan");
    expect(targets.get(c1.id)).toBe(c1.id);
    expect(targets.get(c2.id)).toBe(c2.id);
    expect(targets.get(d.id)).toBe(d.id);
  });

  test("placeholders become the real targets", () => {
    const page = newImportId();
    const other = newImportId();
    const file = newImportId();
    const md =
      `[[${importLink(page)}|Plan]] [[${importLink(other)}]] ![[${importDatabaseEmbed(page)}]] ` +
      `![[${importDatabaseEmbed(other)}]] ![[${importFileRef(file)}]]`;
    const targets = new Map([
      [page, "Notion/Plan"],
      [other, other],
    ]);
    expect(resolvePlaceholders(md, targets, new Map([[file, "photo 2.png"]]))).toBe(
      `[[Notion/Plan|Plan]] [[${other}]] ![[Notion/Plan.base]] ![[${other}]] ![[photo 2.png]]`,
    );
  });

  test("ids are version 7 UUIDs, in order", () => {
    const ids = Array.from({ length: 50 }, newImportId);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect([...ids].sort()).toEqual(ids);
  });
});
