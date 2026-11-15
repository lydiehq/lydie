import { expect, test } from "bun:test";

import { matchesPath } from "./routes.ts";

test("a view's pattern covers its pages", () => {
  expect(matchesPath("/", "/")).toBe(true);
  expect(matchesPath("/", "/trash")).toBe(false);
  expect(matchesPath("/trash", "/trash")).toBe(true);
  expect(matchesPath("/trash", "/trash/x")).toBe(false);
  expect(matchesPath("/d/:id", "/d/01ABC#To%20do")).toBe(true);
  expect(matchesPath("/d/:id", "/d/")).toBe(false);
  expect(matchesPath("/d/:id", "/d/01ABC/x")).toBe(false);
  expect(matchesPath("/reports/*", "/reports")).toBe(true);
  expect(matchesPath("/reports/*", "/reports/2026/q1")).toBe(true);
  expect(matchesPath("/reports/*", "/report")).toBe(false);
});
