import { expect, test } from "bun:test";

import type { TransactionOps } from "./backend.ts";
import { createMissing, findByPath, pathSegments, resolvePath } from "./paths.ts";

type Row = { id: string; title: string; parentId: string | null };

function fakeApp(rows: Row[]) {
  const app = {
    workspace: { workspaceId: "w" },
    backend: {
      query: async (_name: string, params: { parentId: string | null }) =>
        rows.filter((r) => r.parentId === params.parentId),
    },
  };
  // Only `doc.children` is used.
  return app as unknown as Parameters<typeof resolvePath>[0];
}

const rows: Row[] = [
  { id: "meta", title: "Meta", parentId: null },
  { id: "tpl", title: "Templates", parentId: "meta" },
  { id: "top-tpl", title: "Templates", parentId: null },
];

test("segments ignore extra slashes and dots", () => {
  expect(pathSegments("/Meta//Templates/")).toEqual(["Meta", "Templates"]);
  expect(pathSegments("./Daily\\2026")).toEqual(["Daily", "2026"]);
  expect(pathSegments("")).toEqual([]);
});

test("a nested path, without case; the top level for an empty path", async () => {
  const app = fakeApp(rows);
  expect(await findByPath(app, "meta/templates")).toBe("tpl");
  expect(await findByPath(app, "Templates")).toBe("top-tpl");
  expect(await findByPath(app, "Meta/Nope")).toBeNull();
  expect(await resolvePath(app, "")).toEqual({ id: null, missing: [] });
  expect(await resolvePath(app, "Meta/Journal/2026")).toEqual({
    id: "meta",
    missing: ["Journal", "2026"],
  });
});

test("creates what is missing under the deepest existing document", async () => {
  const created: { title: string; parentId: string | null }[] = [];
  const ops = {
    doc: {
      create: async (input: { title: string; parentId: string | null }) => {
        created.push({ title: input.title, parentId: input.parentId });
        return { id: `new-${input.title}` };
      },
    },
  } as unknown as TransactionOps;
  expect(await createMissing(ops, "w", { id: "meta", missing: ["Journal", "2026"] })).toBe(
    "new-2026",
  );
  expect(created).toEqual([
    { title: "Journal", parentId: "meta" },
    { title: "2026", parentId: "new-Journal" },
  ]);
});
