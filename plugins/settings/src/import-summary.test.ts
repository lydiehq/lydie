import { expect, test } from "bun:test";

import type { ImportPage, ImportPlan } from "@lydie/plugin-api/import";

import { describePlan } from "./import-summary.ts";

const page = (id: string, parentId: string | null, database = false): ImportPage => ({
  id,
  parentId,
  title: id,
  markdown: "",
  ...(database ? { database: { properties: [] } } : {}),
});

test("what an import brings in", () => {
  const plan: ImportPlan = {
    rootTitle: "Notion",
    pages: [
      page("a", null),
      page("b", "a"),
      page("db", "a", true),
      page("r1", "db"),
      page("r2", "db"),
    ],
    files: [
      {
        id: "f",
        name: "a.png",
        contentType: "image/png",
        pageId: null,
        size: 2_500_000,
        read: async () => new Uint8Array(),
      },
    ],
    warnings: [],
  };
  expect(describePlan(plan)).toBe(
    "This imports 2 pages, 1 collection with 2 pages in them and 1 file (2.4 MB).",
  );
  expect(describePlan({ ...plan, pages: [page("a", null)], files: [] })).toBe(
    "This imports 1 page.",
  );
});
