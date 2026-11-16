import { expect, test } from "bun:test";

import type { Publication } from "@lydie/plugin-api/hosted";

import { folderMarks, pageMarks } from "./folder-marks.ts";

const publication = (patch: Partial<Publication>) =>
  ({
    documentId: "01JDOC00000000000000000000",
    connector: "github",
    folder: false,
    items: [],
    ...patch,
  }) as Publication;

const items = (...ids: string[]) =>
  ids.map((documentId) => ({ documentId })) as Publication["items"];

test("a connected folder's pages are marked, not its root or other publications' pages", () => {
  const marks = pageMarks([
    publication({ documentId: "a", folder: true, items: items("a", "a1", "a2") }),
    publication({ documentId: "b", items: items("b1") }),
  ]);
  expect([...marks.keys()]).toEqual(["a1", "a2"]);
  expect(marks.get("a1")).toEqual({ connector: "github", label: "Connected to GitHub" });
});

test("only connected folders get a mark, named after their destination", () => {
  const marks = folderMarks([
    publication({ documentId: "a", folder: true }),
    publication({ documentId: "b" }),
    publication({ documentId: "c", folder: true, connector: "gitea" }),
  ]);
  expect([...marks]).toEqual([
    ["a", { connector: "github", label: "Connected to GitHub" }],
    ["c", { connector: "gitea", label: "Connected to gitea" }],
  ]);
});
