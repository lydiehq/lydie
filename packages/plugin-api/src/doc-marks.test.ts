import { afterEach, expect, test } from "bun:test";

import { createElement } from "react";
import { renderToString } from "react-dom/server";

import {
  setConnectedPages,
  setDocumentMarks,
  useConnectedPage,
  useDocumentMark,
} from "./doc-marks.ts";

afterEach(() => {
  setDocumentMarks("a", new Map());
  setDocumentMarks("b", new Map());
  setConnectedPages("a", new Map());
});

function Probe({ id }: { id: string }) {
  return createElement("i", null, useDocumentMark(id)?.label ?? "none");
}
const shown = (id: string) => renderToString(createElement(Probe, { id }));

function PageProbe({ id }: { id: string }) {
  return createElement("i", null, useConnectedPage(id)?.label ?? "none");
}
const page = (id: string) => renderToString(createElement(PageProbe, { id }));

test("a folder's mark and its pages' marks are kept apart", () => {
  const github = { connector: "github", label: "Connected to GitHub" };
  setDocumentMarks("a", new Map([["root", github]]));
  setConnectedPages("a", new Map([["p1", github]]));
  expect(shown("root")).toContain("Connected to GitHub");
  expect(shown("p1")).toContain("none");
  expect(page("p1")).toContain("Connected to GitHub");
  expect(page("root")).toContain("none");
});

test("each owner replaces its own marks, and clearing one leaves the others", () => {
  setDocumentMarks("a", new Map([["d1", { connector: "github", label: "Connected to GitHub" }]]));
  setDocumentMarks("b", new Map([["d2", { connector: "x", label: "Connected to X" }]]));
  expect(shown("d1")).toContain("Connected to GitHub");
  expect(shown("d2")).toContain("Connected to X");
  setDocumentMarks("a", new Map());
  expect(shown("d1")).toContain("none");
  expect(shown("d2")).toContain("Connected to X");
});
